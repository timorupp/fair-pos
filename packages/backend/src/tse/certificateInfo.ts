/**
 * Caches the TSE's signature algorithm, log-time format, and public key —
 * fields Anhang I requires on `tse.csv` (Anhang E) and in every compliant
 * QR-code (Anhang I §2), but which are fixed per TSE/firmware, not per
 * transaction (see `native/tse-cli`'s `info` command). Fetching them fresh
 * on every receipt print or export would add TSE-queue latency for no
 * reason, so the first successful read is kept for the rest of the process
 * lifetime.
 */
import { getTseInfo } from './client.js';

/** The three per-TSE constant fields this module caches. */
export interface TseCertificateInfo {
  signatureAlgorithm: string;
  logTimeFormat: string;
  /** Base64-encoded, as returned by `native/tse-cli`. */
  publicKeyBase64: string;
}

let cached: TseCertificateInfo | null = null;

/**
 * Returns the TSE's cached certificate/algorithm fields, reading them from
 * the TSE once on first call. Never throws: returns `null` when the TSE is
 * unconfigured or unreachable, same tolerant pattern as the rest of the TSE
 * integration (see docs/TSE-Integration.md → "TSE-Ausfall") — callers render
 * an empty field in that case, exactly like a missing signature.
 *
 * @returns The cached fields, or `null` if they couldn't be read (yet).
 */
export async function getTseCertificateInfo(): Promise<TseCertificateInfo | null> {
  if (cached) return cached;
  try {
    const info = await getTseInfo();
    cached = {
      signatureAlgorithm: info.signatureAlgorithm,
      logTimeFormat: info.logTimeFormat,
      publicKeyBase64: info.publicKey,
    };
    return cached;
  } catch {
    return null;
  }
}

/** Test-only: clears the cache so a test can simulate a fresh process (e.g. TSE reachable only on a later attempt). */
export function resetTseCertificateInfoCache(): void {
  cached = null;
}
