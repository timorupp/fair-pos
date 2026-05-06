/**
 * Print worker.
 * Listens for new print jobs via PostgreSQL LISTEN/NOTIFY and sends
 * ESC/POS data to network printers over TCP/IP. Failed jobs are retried
 * on a fixed interval.
 */
import net from 'node:net';
import pg from 'pg';
import { config } from '../config.js';
import { query } from '../db/client.js';

const RETRY_INTERVAL_MS = 30_000;
const PRINTER_TIMEOUT_MS = 10_000;

/** Raw ESC/POS row as returned by the print job query. */
interface PrintJobRow {
  id: string;
  content: string;
  ip_address: string;
  port: number;
}

/** Opens a TCP connection and writes raw ESC/POS bytes to the printer. */
function sendToPrinter(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(data, (err) => {
        if (err) { reject(err); return; }
        socket.end();
        resolve();
      });
    });
    socket.once('error', reject);
    socket.setTimeout(PRINTER_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error(`Printer ${ip}:${port} timed out`));
    });
  });
}

/** Fetches a pending job, marks it as printing, sends it, then marks done/failed. */
async function processJob(jobId: string): Promise<void> {
  const result = await query<PrintJobRow>(`
    SELECT pj.id, pj.content, p.ip_address, p.port
    FROM print_job pj
    JOIN printer p ON p.id = pj.printer_id
    WHERE pj.id = $1 AND pj.status = 'pending'
  `, [jobId]);

  if (result.rows.length === 0) return;
  const job = result.rows[0]!;

  await query(
    `UPDATE print_job
     SET status = 'printing', attempts = attempts + 1, last_attempt_at = now()
     WHERE id = $1`,
    [job.id],
  );

  try {
    const data = Buffer.from(job.content, 'base64');
    await sendToPrinter(job.ip_address, job.port, data);
    await query(`UPDATE print_job SET status = 'done' WHERE id = $1`, [job.id]);
    console.log(`[print-worker] job ${job.id} done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE print_job SET status = 'failed', error_message = $2 WHERE id = $1`,
      [job.id, message],
    );
    console.error(`[print-worker] job ${job.id} failed: ${message}`);
  }
}

/** Resets all failed jobs to pending and processes them. */
async function retryFailedJobs(): Promise<void> {
  await query(`UPDATE print_job SET status = 'pending' WHERE status = 'failed'`);
  const result = await query<{ id: string }>(
    `SELECT id FROM print_job WHERE status = 'pending'`,
  );
  for (const row of result.rows) {
    await processJob(row.id);
  }
}

/**
 * Starts the print worker.
 * Uses a dedicated pg.Client (not the shared pool) to hold a persistent
 * LISTEN connection, which requires an exclusive session.
 */
export function startPrintWorker(): void {
  const client = new pg.Client({ connectionString: config.databaseUrl });

  client.connect().then(async () => {
    await client.query('LISTEN print_job_new');
    console.log('[print-worker] listening for print jobs');

    client.on('notification', (msg) => {
      if (msg.channel === 'print_job_new' && msg.payload) {
        processJob(msg.payload).catch((err) =>
          console.error('[print-worker] error processing job:', err),
        );
      }
    });

    setInterval(() => {
      retryFailedJobs().catch((err) =>
        console.error('[print-worker] retry error:', err),
      );
    }, RETRY_INTERVAL_MS);
  }).catch((err) => {
    console.error('[print-worker] failed to connect:', err);
  });
}
