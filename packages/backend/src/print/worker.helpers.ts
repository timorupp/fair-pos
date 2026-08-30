/** Pure decision helpers for the print worker. Kept separate so they can be unit-tested without booting the app or DB. */

/**
 * Maximum number of attempts before a job is moved to the terminal `failed` state.
 * With a ~30-second sweep cadence, 500 attempts give the system roughly four hours
 * of printer-outage tolerance (e.g. unplugged cable, overheated printer, network drop)
 * before manual intervention is required.
 */
export const MAX_ATTEMPTS = 500;

/** Minimum cool-down between attempts on the same job, in seconds. */
export const RETRY_COOLDOWN_SECONDS = 20;

/** Decides whether a job that just failed should be retried (returns true) or terminally failed (false). */
export function shouldRetry(attempts: number): boolean {
  return attempts < MAX_ATTEMPTS;
}

/** Decodes a base64-encoded print-job payload into raw bytes. */
export function decodeContent(content: string): Buffer {
  return Buffer.from(content, 'base64');
}

/** Encodes raw bytes into the base64 text representation used in the `print_job.content` column. */
export function encodeContent(data: Buffer): string {
  return data.toString('base64');
}
