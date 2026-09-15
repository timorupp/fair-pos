/**
 * Caches the TSE's signature algorithm, log-time format, public key, and
 * certificate chain — fields Anhang I requires on `tse.csv` (Anhang E) and
 * in every compliant QR-code (Anhang I §2), but which are fixed per
 * TSE/firmware, not per transaction (see `native/tse-cli`'s `info`
 * command). Fetching them fresh on every receipt print or export would add
 * TSE-queue latency for no reason, so the first successful read is kept for
 * the rest of the process lifetime.
 */
import { getTseInfo } from './client.js';

/** The per-TSE constant fields this module caches. */
export interface TseCertificateInfo {
  signatureAlgorithm: string;
  logTimeFormat: string;
  /** Base64-encoded, as returned by `native/tse-cli`. */
  publicKeyBase64: string;
  /**
   * Base64-encoded PEM certificate chain (Task #120), leaf certificate
   * first — `tse.csv` fields `TSE_ZERTIFIKAT_I`/`TSE_ZERTIFIKAT_II`. Empty
   * string if the TSE couldn't provide it (e.g. self-test not yet passed).
   * The exact mapping of this chain onto the two separate `TSE_ZERTIFIKAT_I`/
   * `TSE_ZERTIFIKAT_II` columns still needs verifying against the
   * authoritative DSFinV-K Anhang I/E spec text before being wired into the
   * export — see BACKLOG.md Task #120.
   */
  certificateChainBase64: string;
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
      certificateChainBase64: info.certificateChain,
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
