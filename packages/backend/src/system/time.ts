/**
 * Manually sets the server's system clock — Task #60. Exists because the
 * TSE time synchronisation (`maintainTse`, see tse/client.ts) syncs the TSE
 * against the *server's* system time, so a wrong system clock defeats the
 * whole point. The register can run fully offline, so NTP isn't assumed to
 * be reachable — manual entry via the admin UI is the supported path.
 */
import { execFile } from 'node:child_process';
import { config } from '../config.js';

/** `<input type="datetime-local" step="1">` sends `YYYY-MM-DDTHH:MM:SS`. */
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Validates and normalises a `datetime-local` input value into the
 * `YYYY-MM-DD HH:MM:SS` format `timedatectl set-time` expects.
 *
 * @param localDateTime - Raw value from the admin UI's time-set form.
 * @returns The normalised value.
 * @throws {Error} When the input doesn't match the expected shape.
 */
export function normalizeSetTimeInput(localDateTime: string): string {
  if (!DATETIME_LOCAL_PATTERN.test(localDateTime)) {
    throw new Error('Ungültiges Datumsformat');
  }
  return localDateTime.replace('T', ' ');
}

/**
 * Sets the server's system clock via `sudo timedatectl set-time`. Requires a
 * sudoers rule that lets the `fairpos` service user run exactly this command
 * without a password (the service process itself is deliberately
 * unprivileged — see Abschnitt 4 der Installationsanleitung) — see
 * docs/Installationsanleitung.md, "Systemzeit manuell setzen", for the exact
 * rule. Without that rule, this rejects with sudo's own permission error.
 *
 * @param localDateTime - `YYYY-MM-DDTHH:MM:SS`, as sent by an
 *   `<input type="datetime-local" step="1">`.
 * @throws {Error} When the input is malformed, or the underlying command fails.
 */
export async function setSystemTime(localDateTime: string): Promise<void> {
  // `normalizeSetTimeInput` runs inside this `async` function body specifically
  // so a validation throw becomes a rejected promise like every other failure
  // here, not a synchronous throw — callers only need one error-handling path
  // (`await ... catch`/`.catch(...)`), not two.
  const normalized = normalizeSetTimeInput(localDateTime);
  return new Promise((resolve, reject) => {
    execFile(
      config.sudoPath ?? 'sudo',
      ['timedatectl', 'set-time', normalized],
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Systemzeit konnte nicht gesetzt werden: ${stderr.trim() || err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Sets the server's system timezone via `sudo timedatectl set-timezone`.
 * Same sudoers requirement as {@link setSystemTime} — see
 * docs/Installationsanleitung.md Abschnitt 13.
 *
 * @param timezone - An IANA timezone identifier, e.g. `Europe/Berlin`. Validated
 *   against `Intl.supportedValuesOf('timeZone')` before ever invoking `sudo` —
 *   the frontend already only offers values from that same list, but the
 *   backend re-validates rather than trusting client input.
 * @throws {Error} When the timezone identifier is unknown, or the underlying command fails.
 */
export async function setSystemTimezone(timezone: string): Promise<void> {
  if (!Intl.supportedValuesOf('timeZone').includes(timezone)) {
    throw new Error('Unbekannte Zeitzone');
  }
  return new Promise((resolve, reject) => {
    execFile(
      config.sudoPath ?? 'sudo',
      ['timedatectl', 'set-timezone', timezone],
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Zeitzone konnte nicht gesetzt werden: ${stderr.trim() || err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}
