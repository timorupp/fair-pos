/**
 * Extracts the TSE's own (leaf) certificate from the PEM chain read via
 * `worm_getLogMessageCertificate` and splits it into the two 1.000-character
 * chunks DSFinV-K's `tse.csv` expects (`TSE_ZERTIFIKAT_I`/`TSE_ZERTIFIKAT_II`,
 * Anhang E S. 78f. of the official DSFinV-K 2.4 spec, bzst.de).
 *
 * Per `WormDLL.h`'s doc comment on `worm_getLogMessageCertificate`: "The
 * returned data is a single PEM file, which contains multiple certificates
 * [...] only the leaf certificate (the first one in the PEM file) is
 * required [to verify the signature]." DSFinV-K's own field description
 * ("Das Zertifikat der TSE", singular) matches this — only the leaf
 * certificate goes into TSE_ZERTIFIKAT_I/II, not the full chain.
 */

const CHUNK_LENGTH = 1000;

/** The TSE's leaf certificate, base64-DER, split into the two DSFinV-K columns. */
export interface LeafCertificateChunks {
  /** First 1.000 characters of the leaf certificate's base64 body — `TSE_ZERTIFIKAT_I`. */
  zertifikatI: string;
  /** Remaining characters (up to another 1.000) — `TSE_ZERTIFIKAT_II`. Empty if the whole certificate fit into `zertifikatI`. */
  zertifikatII: string;
}

/**
 * Extracts and chunks the leaf certificate from a base64-encoded PEM chain.
 *
 * @param certificateChainBase64 - Base64 encoding of the raw PEM text
 *   returned by `worm_getLogMessageCertificate` (as read by `tse/certificateInfo.ts`),
 *   or an empty string when the TSE didn't supply one.
 * @returns The chunked leaf certificate, or empty strings if `certificateChainBase64`
 *   is empty or contains no parseable PEM certificate block.
 */
export function extractLeafCertificateChunks(certificateChainBase64: string): LeafCertificateChunks {
  if (!certificateChainBase64) return { zertifikatI: '', zertifikatII: '' };

  let pemText: string;
  try {
    pemText = Buffer.from(certificateChainBase64, 'base64').toString('utf-8');
  } catch {
    return { zertifikatI: '', zertifikatII: '' };
  }

  const match = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pemText);
  if (!match) return { zertifikatI: '', zertifikatII: '' };

  // The PEM body is already base64(DER) — just remove the line breaks the PEM
  // encoding wraps it in; no further encoding/decoding needed.
  const leafBase64 = match[1]!.replace(/\s+/g, '');

  return {
    zertifikatI: leafBase64.slice(0, CHUNK_LENGTH),
    zertifikatII: leafBase64.slice(CHUNK_LENGTH, CHUNK_LENGTH * 2),
    // A leaf certificate longer than 2.000 base64 characters (~1.5 KB DER)
    // would need TSE_ZERTIFIKAT_III+ columns per the spec — not implemented,
    // since tse.csv only declares I/II and real-world ECDSA TSE certificates
    // stay well under this size.
  };
}
