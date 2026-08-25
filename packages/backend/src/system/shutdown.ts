/**
 * Cleanly shuts down the server — Task #61. Exists so a normal (non-admin-OS-
 * account) Vereins-Helfer:in can power the server off after an event without
 * ever needing shell access.
 */
import { execFile } from 'node:child_process';
import { config } from '../config.js';

/**
 * Runs `sudo systemctl poweroff`. Requires a sudoers rule that lets the
 * `fairpos` service user run exactly this command without a password (the
 * service process itself is deliberately unprivileged — see Abschnitt 4 der
 * Installationsanleitung) — see docs/Installationsanleitung.md Abschnitt 13.
 * Without that rule, this rejects with sudo's own permission error instead
 * of silently doing nothing.
 *
 * Fixed command, no arguments — unlike `setSystemTime`, there is no
 * caller-supplied input here to validate.
 *
 * @throws {Error} When the underlying command fails.
 */
export async function shutdownServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      config.sudoPath ?? 'sudo',
      ['systemctl', 'poweroff'],
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Server konnte nicht heruntergefahren werden: ${stderr.trim() || err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}
