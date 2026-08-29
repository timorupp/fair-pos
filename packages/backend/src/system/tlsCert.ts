/**
 * TLS certificate upload for the nginx reverse proxy (Task #66). The admin
 * pastes/uploads a PEM certificate and its matching private key; both are
 * validated here — format, key/certificate match, not already expired —
 * entirely in-memory, before anything touches the filesystem or a
 * privileged process. Only once validation passes does {@link installCert}
 * stage the pair and hand off to the privileged install script.
 */
import { execFile } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const STAGED_CERT_FILENAME = 'fairpos.crt';
const STAGED_KEY_FILENAME = 'fairpos.key';

/**
 * Fixed, no-argument path of the privileged install script — see
 * docs/Installationsanleitung.md, "Reverse-Proxy / TLS", for its exact
 * content and the sudoers rule that allows the `fairpos` service user to
 * run it without a password. Deliberately takes no arguments (unlike
 * `timedatectl set-time <value>`) — it always reads from the fixed staging
 * directory above, so the sudoers rule needs no wildcard at all.
 */
const INSTALL_SCRIPT_PATH = '/opt/fairpos/scripts/install-cert.sh';

/** Parsed metadata of a certificate, shown in the admin UI. */
export interface CertInfo {
  /** e.g. "CN=fairpos.local". */
  subject: string;
  validFrom: string;
  validTo: string;
}

/**
 * Validates that `certPem` is a well-formed, not-yet-expired X.509
 * certificate whose public key matches `keyPem`'s private key. Runs
 * entirely in-memory — never writes anything, never invokes `sudo`.
 *
 * @param certPem - Uploaded certificate, PEM-encoded (a single leaf
 *   certificate, or a full chain with the leaf first — nginx accepts both
 *   in `ssl_certificate`).
 * @param keyPem - Uploaded private key, PEM-encoded.
 * @returns The certificate's parsed subject/validity, for display.
 * @throws {Error} A German, user-facing message describing exactly what's
 *   wrong — never a raw Node/OpenSSL error.
 */
export function validateCertKeyPair(certPem: string, keyPem: string): CertInfo {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    throw new Error('Zertifikat konnte nicht gelesen werden (kein gültiges PEM-Format?)');
  }

  let key;
  try {
    key = createPrivateKey(keyPem);
  } catch {
    throw new Error('Privater Schlüssel konnte nicht gelesen werden (kein gültiges PEM-Format?)');
  }

  if (!cert.checkPrivateKey(key)) {
    throw new Error('Der private Schlüssel passt nicht zu diesem Zertifikat');
  }

  if (new Date(cert.validTo) < new Date()) {
    throw new Error(`Zertifikat ist bereits abgelaufen (gültig bis ${cert.validTo})`);
  }

  return { subject: cert.subject, validFrom: cert.validFrom, validTo: cert.validTo };
}

/**
 * Stages an already-validated cert/key pair and triggers the privileged
 * install script, which copies them into nginx's real certificate location,
 * validates the result with `nginx -t`, automatically rolls back on
 * failure (so a bad certificate can never take down the running proxy),
 * and otherwise reloads nginx. Requires the sudoers rule described in
 * docs/Installationsanleitung.md — without it, this rejects with sudo's own
 * permission error instead of silently doing nothing.
 *
 * @param certPem - Already-validated certificate (see {@link validateCertKeyPair}).
 * @param keyPem - Already-validated private key.
 * @throws {Error} When staging fails, or the privileged script reports
 *   failure (e.g. nginx rejected the new certificate and rolled back).
 */
export async function installCert(certPem: string, keyPem: string): Promise<void> {
  await mkdir(config.tlsStagingDir, { recursive: true });
  await writeFile(path.join(config.tlsStagingDir, STAGED_CERT_FILENAME), certPem, { mode: 0o644 });
  await writeFile(path.join(config.tlsStagingDir, STAGED_KEY_FILENAME), keyPem, { mode: 0o600 });

  return new Promise((resolve, reject) => {
    execFile(
      config.sudoPath ?? 'sudo',
      [INSTALL_SCRIPT_PATH],
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Zertifikat konnte nicht installiert werden: ${stderr.trim() || err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Reads and parses nginx's currently installed certificate for display in
 * the admin UI. The file is world-readable by design (0644, see the install
 * script), so this never needs elevated privileges.
 *
 * @returns The installed certificate's subject/validity, or `null` if none
 *   is installed yet, or the file couldn't be parsed.
 */
export async function readInstalledCertInfo(): Promise<CertInfo | null> {
  let pem: string;
  try {
    pem = await readFile(config.tlsCertPath, 'utf-8');
  } catch {
    return null;
  }
  try {
    const cert = new X509Certificate(pem);
    return { subject: cert.subject, validFrom: cert.validFrom, validTo: cert.validTo };
  } catch {
    return null;
  }
}
