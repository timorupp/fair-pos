/**
 * Node-side client for the FairPOS TSE CLI tool (native/tse-cli).
 *
 * Every exported function here goes through `enqueueTseCall` (see queue.ts)
 * because the physical TSE only accepts one command at a time. See
 * docs/TSE-Integration.md for the full architecture and the CLI's JSON
 * contract that this module parses.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { enqueueTseCall } from './queue.js';
import { TseError, type TseInfo, type TseTransactionResult } from './types.js';

/** Default location of the built CLI binary, relative to this compiled module. */
const DEFAULT_CLI_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'native',
  'tse-cli',
  'vendor',
  'bin',
  'tseCli',
);

/** Raw JSON envelope every tseCli invocation prints on stdout. */
interface CliEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Resolves the mount point and client id from config, throwing a clear error
 * if the TSE hasn't been configured — better than a confusing downstream
 * failure from the CLI itself.
 *
 * @returns The configured mount point and client id.
 */
function requireTseConfig(): { mountPoint: string; clientId: string } {
  if (!config.tseMountPoint || !config.tseClientId) {
    throw new Error(
      'TSE ist nicht konfiguriert (Mount-Pfad / Client-ID fehlen — Systemeinstellungen -> System in der Admin-UI).',
    );
  }
  return { mountPoint: config.tseMountPoint, clientId: config.tseClientId };
}

/**
 * Default per-call timeout for CLI commands that don't run a self-test.
 * A worked example from live hardware (2026-08-26): calling `maintain` right
 * after plugging the TSE in — no prior command issued — reliably timed out
 * even 20+ seconds after insertion, but succeeded immediately once preceded
 * by any other call (e.g. `info`). Points at the TSE's own internal
 * warm-up/boot sequence starting only on its *first received command*, not
 * on physical insertion — so the very first command against a freshly
 * plugged-in TSE should budget for that, on top of whatever the command
 * itself needs. See {@link SELF_TEST_TIMEOUT_MS}.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Timeout for CLI commands that run a self-test internally (`setup`,
 * `maintain` — see `native/tse-cli/src/tseCli.cpp`'s `cmdMaintain`, which
 * explicitly runs `worm_tse_runSelfTest` before anything else). Self-test is
 * a heavier operation than a plain read/transaction call, and — per the
 * finding above — may also have to absorb the TSE's cold-start warm-up on
 * the first command after insertion. Generous on purpose: this runs from an
 * explicit admin action or one-time setup, never on the hot checkout path,
 * so a slower ceiling costs nothing when the TSE responds promptly.
 */
const SELF_TEST_TIMEOUT_MS = 60_000;

/**
 * Runs the TSE CLI with the given command and arguments, and parses its
 * single-line JSON response.
 *
 * @param mountPoint - Filesystem mount point of the TSE (first CLI argument).
 * @param command - CLI subcommand (`setup`, `start`, `info`, ...).
 * @param args - Remaining positional arguments for that subcommand.
 * @param timeoutMs - Max time to wait for the CLI to exit, in milliseconds — see {@link DEFAULT_TIMEOUT_MS}/{@link SELF_TEST_TIMEOUT_MS}.
 * @returns The parsed `result` object on success.
 * @throws {TseError} When the CLI reports `ok: false`.
 * @throws {Error} When the CLI produced no parseable output at all (crash, missing binary, ...).
 */
async function runCli<T>(
  mountPoint: string,
  command: string,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const cliPath = config.tseCliPath ?? DEFAULT_CLI_PATH;
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      cliPath,
      [mountPoint, command, ...args],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        // execFile treats a non-zero exit code as an error, but our CLI always
        // prints a valid JSON envelope on stdout regardless of exit code — the
        // envelope's `ok` field is the real success/failure signal. Only reject
        // here if stdout is genuinely empty (CLI missing, crashed, killed).
        if (!stdout) {
          reject(err ?? new Error(stderr || 'tseCli produced no output'));
          return;
        }
        resolve(stdout);
      },
    );
  });

  let parsed: CliEnvelope<T>;
  try {
    parsed = JSON.parse(stdout.trim()) as CliEnvelope<T>;
  } catch {
    throw new Error(`tseCli returned invalid JSON: ${stdout.trim()}`);
  }
  if (!parsed.ok) {
    const e = parsed.error ?? { code: -1, message: 'unknown error' };
    throw new TseError(e.code, e.message);
  }
  return parsed.result as T;
}

/**
 * Starts a new TSE transaction.
 *
 * @param processType - Fiscal process type (e.g. `Kassenbeleg-V1`, `AVBestellung`).
 * @param processData - Raw transaction payload bytes to store on the TSE.
 * @returns The transaction's assigned number, signature, and timestamps.
 */
export function startTransaction(
  processType: string,
  processData: Buffer,
): Promise<TseTransactionResult> {
  return enqueueTseCall(async () => {
    const { mountPoint, clientId } = requireTseConfig();
    return runCli<TseTransactionResult>(mountPoint, 'start', [
      clientId,
      processType,
      processData.toString('base64'),
    ]);
  });
}

/**
 * Updates an already-started TSE transaction.
 *
 * @param transactionNumber - Number returned by {@link startTransaction}.
 * @param processType - Fiscal process type for this update.
 * @param processData - Raw payload bytes for this update step.
 * @returns The updated signature and timestamps.
 */
export function updateTransaction(
  transactionNumber: number,
  processType: string,
  processData: Buffer,
): Promise<TseTransactionResult> {
  return enqueueTseCall(async () => {
    const { mountPoint, clientId } = requireTseConfig();
    return runCli<TseTransactionResult>(mountPoint, 'update', [
      clientId,
      String(transactionNumber),
      processType,
      processData.toString('base64'),
    ]);
  });
}

/**
 * Finishes a TSE transaction. The transaction number becomes invalid for
 * further use afterwards.
 *
 * @param transactionNumber - Number returned by {@link startTransaction}.
 * @param processType - Fiscal process type for this transaction's conclusion.
 * @param processData - Final payload bytes to store on the TSE.
 * @returns The final signature and timestamps for this transaction.
 */
export function finishTransaction(
  transactionNumber: number,
  processType: string,
  processData: Buffer,
): Promise<TseTransactionResult> {
  return enqueueTseCall(async () => {
    const { mountPoint, clientId } = requireTseConfig();
    return runCli<TseTransactionResult>(mountPoint, 'finish', [
      clientId,
      String(transactionNumber),
      processType,
      processData.toString('base64'),
    ]);
  });
}

/**
 * Reads the current TSE status/health snapshot.
 *
 * @returns Self-test status, remaining signature budget, certificate expiry, and more.
 */
export function getTseInfo(): Promise<TseInfo> {
  return enqueueTseCall(async () => {
    const { mountPoint } = requireTseConfig();
    return runCli<TseInfo>(mountPoint, 'info', []);
  });
}

/**
 * Reads the `info` snapshot at an arbitrary mount point, bypassing
 * `config.tseMountPoint` — used by `tse/detect.ts` to probe candidate
 * mount points before any of them is actually configured. `info` doesn't
 * take a client id, so unlike {@link getTseInfo} this never requires one.
 * Still goes through the same queue as every other TSE call, so a probe
 * can't race a real signing operation.
 *
 * @param mountPoint - Candidate filesystem path to probe.
 * @returns The TSE status snapshot if a real TSE is mounted there.
 * @throws {TseError} When nothing valid is mounted at `mountPoint` (worm_init
 *   itself validates this — see `native/tse-cli`'s `info` command).
 */
export function getTseInfoAt(mountPoint: string): Promise<TseInfo> {
  return enqueueTseCall(async () => runCli<TseInfo>(mountPoint, 'info', []));
}

/**
 * Runs routine TSE upkeep (self test + time synchronization). Intended to be
 * called periodically by a scheduler, not per-transaction — see
 * docs/TSE-Integration.md section 6.
 *
 * @param timeAdminPin - The TSE's TimeAdmin PIN (the one credential FairPOS
 *   is allowed to store persistently).
 */
export function maintainTse(timeAdminPin: string): Promise<void> {
  return enqueueTseCall(async () => {
    const { mountPoint, clientId } = requireTseConfig();
    await runCli<Record<string, never>>(
      mountPoint, 'maintain', [clientId, timeAdminPin], SELF_TEST_TIMEOUT_MS,
    );
  });
}

/**
 * Performs one-time provisioning of a fresh TSE. Fails if the TSE was already
 * set up (by design — re-running setup on a live TSE is an operator error
 * that should surface, not be silently handled).
 *
 * @param opts - Credential seed and the four PINs/PUKs to configure.
 */
export function setupTse(opts: {
  credentialSeed: string;
  adminPuk: string;
  adminPin: string;
  timeAdminPin: string;
}): Promise<void> {
  return enqueueTseCall(async () => {
    const { mountPoint, clientId } = requireTseConfig();
    await runCli<Record<string, never>>(
      mountPoint, 'setup',
      [clientId, opts.credentialSeed, opts.adminPuk, opts.adminPin, opts.timeAdminPin],
      SELF_TEST_TIMEOUT_MS,
    );
  });
}

/**
 * Exports the complete TSE log archive as a raw TR-03153 TAR file. Consumed
 * by the backup job / DSFinV-K pipeline — this module only writes the file,
 * it does not interpret its contents.
 *
 * @param outputFile - Absolute path the TAR archive will be written to.
 */
export function exportTar(outputFile: string): Promise<void> {
  return enqueueTseCall(async () => {
    const { mountPoint } = requireTseConfig();
    await runCli<Record<string, never>>(mountPoint, 'exportTar', [outputFile]);
  });
}
