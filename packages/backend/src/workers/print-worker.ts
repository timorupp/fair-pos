/**
 * Print worker — runs in the same Node.js process as the API.
 *
 * Picks up jobs from `print_job` via PostgreSQL LISTEN/NOTIFY and sends their
 * payload (base64-encoded ESC/POS bytes) to the assigned printer over TCP.
 *
 * Reliability:
 *  - **Atomic claim**: a job transitions pending → printing in a single UPDATE,
 *    so NOTIFY and the periodic retry loop cannot process the same job twice.
 *  - **Crash recovery**: on worker start, any leftover `printing` rows are reset
 *    to `pending` (a previous run died mid-print).
 *  - **Retry with cooldown**: failed jobs go back to `pending` until MAX_ATTEMPTS
 *    is reached; the retry loop only picks up jobs whose last attempt is older
 *    than RETRY_COOLDOWN_SECONDS.
 *  - **Terminal failure**: after MAX_ATTEMPTS, a job is marked `failed`
 *    permanently and requires manual intervention.
 */
import pg from 'pg';
import { config } from '../config.js';
import { query } from '../db/client.js';
import { sendToPrinter } from '../print/tcp.js';
import { decodeContent, shouldRetry, RETRY_COOLDOWN_SECONDS } from '../print/worker.helpers.js';

const RETRY_INTERVAL_MS = 30_000;

/** Row returned by claimJob — a job that has been atomically transitioned to 'printing'. */
interface ClaimedJob {
  id: string;
  content: string;
  attempts: number;
  ip_address: string;
  port: number;
}

/**
 * Atomically marks a pending job as 'printing', increments its attempt counter,
 * and returns the joined printer connection details. Returns null if the job
 * was already taken by another worker invocation, doesn't exist, or has no
 * matching printer.
 */
async function claimJob(jobId: string): Promise<ClaimedJob | null> {
  const result = await query<ClaimedJob>(`
    UPDATE print_job pj
       SET status = 'printing',
           attempts = pj.attempts + 1,
           last_attempt_at = now()
      FROM printer p
     WHERE pj.id = $1
       AND pj.status = 'pending'
       AND p.id = pj.printer_id
    RETURNING pj.id, pj.content, pj.attempts, p.ip_address, p.port
  `, [jobId]);
  return result.rows[0] ?? null;
}

/** Fetches, sends, and finalises a single job. Safe to call concurrently — the claim is atomic. */
async function processJob(jobId: string): Promise<void> {
  const job = await claimJob(jobId);
  if (!job) return;

  try {
    await sendToPrinter(job.ip_address, job.port, decodeContent(job.content));
    await query(`UPDATE print_job SET status = 'done', error_message = NULL WHERE id = $1`, [job.id]);
    console.log(`[print-worker] job ${job.id} done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next = shouldRetry(job.attempts) ? 'pending' : 'failed';
    await query(
      `UPDATE print_job SET status = $2, error_message = $3 WHERE id = $1`,
      [job.id, next, message],
    );
    console.warn(`[print-worker] job ${job.id} attempt ${job.attempts} → ${next}: ${message}`);
  }
}

/**
 * Picks up any `pending` job whose last attempt is older than the cooldown.
 * Skips jobs that have never been attempted only if NOTIFY missed them
 * (last_attempt_at IS NULL).
 */
async function retryPending(): Promise<void> {
  const result = await query<{ id: string }>(`
    SELECT id FROM print_job
     WHERE status = 'pending'
       AND (last_attempt_at IS NULL
            OR last_attempt_at < now() - make_interval(secs => $1))
     ORDER BY created_at
  `, [RETRY_COOLDOWN_SECONDS]);
  for (const row of result.rows) {
    await processJob(row.id);
  }
}

/** Resets any `printing` rows back to `pending` so they get retried after a crash. */
async function recoverInFlight(): Promise<void> {
  const result = await query(
    `UPDATE print_job SET status = 'pending' WHERE status = 'printing'`,
  );
  if (result.rowCount && result.rowCount > 0) {
    console.warn(`[print-worker] recovered ${result.rowCount} in-flight job(s) from previous run`);
  }
}

/**
 * Starts the print worker. Uses a dedicated pg.Client (not the shared pool)
 * because LISTEN requires an exclusive session that the pool cannot guarantee.
 */
export function startPrintWorker(): void {
  const client = new pg.Client({ connectionString: config.databaseUrl });

  client.connect().then(async () => {
    await recoverInFlight();
    await client.query('LISTEN print_job_new');
    console.log('[print-worker] listening for print jobs');

    client.on('notification', (msg) => {
      if (msg.channel === 'print_job_new' && msg.payload) {
        processJob(msg.payload).catch((err) =>
          console.error('[print-worker] error processing job:', err),
        );
      }
    });

    // Periodic sweep for jobs missed by NOTIFY (e.g. printer was offline last time).
    setInterval(() => {
      retryPending().catch((err) =>
        console.error('[print-worker] retry sweep error:', err),
      );
    }, RETRY_INTERVAL_MS);
  }).catch((err) => {
    console.error('[print-worker] failed to connect:', err);
  });
}
