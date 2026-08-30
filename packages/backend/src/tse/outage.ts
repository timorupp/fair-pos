/**
 * Automated TSE-outage documentation.
 *
 * AEAO zu § 146a AO, Nr. 1.14.1 requires documenting an outage's start time,
 * end time, and cause — "Diese Dokumentation kann auch automatisiert durch
 * das elektronische Aufzeichnungssystem erfolgen" (this may be automated by
 * the recording system itself). `recordTseFailure`/`recordTseRecovered` are
 * called by every business-flow call site that attempts a TSE signature (see
 * tse/signing.ts) so this happens without any manual step. See
 * docs/TSE-Integration.md → "TSE-Ausfall".
 */
import { query } from '../db/client.js';

/**
 * Opens a new outage row if none is currently open. A "failure" here also
 * covers a missing TSE configuration — from a compliance standpoint, no
 * signature is no signature regardless of the reason.
 *
 * Concurrent callers (e.g. several checkouts failing at the same time during
 * a real outage) could otherwise both insert an open row — a partial unique
 * index (`tse_outage_one_open_idx`, see migration 0006) makes the second
 * insert a no-op instead, so at most one row stays open regardless of timing.
 *
 * @param reason - Human-readable cause (error message, or "nicht konfiguriert").
 */
export async function recordTseFailure(reason: string): Promise<void> {
  await query(
    `INSERT INTO tse_outage (reason) VALUES ($1)
     ON CONFLICT ((true)) WHERE ended_at IS NULL DO NOTHING`,
    [reason],
  );
}

/** Closes the currently open outage row, if any. Called after a successful TSE signature. */
export async function recordTseRecovered(): Promise<void> {
  await query(`UPDATE tse_outage SET ended_at = now() WHERE ended_at IS NULL`);
}
