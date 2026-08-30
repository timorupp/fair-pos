/**
 * Reads and validates all required environment variables at startup.
 * Throws immediately if a required variable is missing so the error is obvious.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Validated application configuration derived from environment variables.
 *
 * `tseMountPoint`/`tseClientId` start at `null` and are exclusively set by
 * `tse/settings.ts`, which loads them from the `system_setting` table (the
 * only configuration path — admin UI "Systemeinstellungen -> System",
 * including the "Auto-erkennen" button) at startup and after every save.
 * There is deliberately no environment-variable seed for these two anymore —
 * it was a redundant second configuration path prone to drifting from what
 * the UI actually has stored. The values used on the hot checkout path stay
 * a synchronous in-memory read even though their canonical storage is the
 * database. See docs/TSE-Integration.md.
 */
export const config = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  // Default '0.0.0.0' preserves existing no-proxy LAN deployments. Once an
  // nginx reverse proxy (Task #66) terminates TLS in front of this process,
  // the Installationsanleitung recommends setting this to '127.0.0.1' so the
  // backend is only reachable through the proxy, never directly on its own
  // plain-HTTP port.
  host: process.env['HOST'] ?? '0.0.0.0',
  sessionSecret: requireEnv('SESSION_SECRET'),
  // Keyed-hash secret for PIN login (Task #90) — deterministic
  // HMAC-SHA256(pinHashSecret, normalizedPin) so a PIN can be looked up
  // directly by its hash (unlike bcrypt's per-row salt, which would force a
  // slow linear scan over every user on every login attempt). Kept separate
  // from sessionSecret (distinct purposes) and MUST be kept out of DB
  // backups — an attacker with only a stolen DB dump and no access to this
  // secret cannot precompute a rainbow table for the PIN keyspace.
  pinHashSecret: requireEnv('PIN_HASH_SECRET'),
  databaseUrl: requireEnv('DATABASE_URL'),
  // Set exclusively via tse/settings.ts (system_setting / admin UI) — null
  // until configured. packages/backend/src/tse throws a clear error only if
  // something actually tries to use the TSE while these are still null.
  tseMountPoint: null as string | null,
  tseClientId: null as string | null,
  // Override point for tests — points at a stub script instead of the real,
  // gitignored, hardware-dependent binary. Not meant to be set in production.
  tseCliPath: process.env['TSE_CLI_PATH'] ?? null,
  // Override point for tests (points at a stub script) — production relies
  // on `pg_dump` being on PATH (installed alongside the distro's `postgresql`
  // package, see docs/Installationsanleitung.md).
  pgDumpPath: process.env['PG_DUMP_PATH'] ?? null,
  // Override point for tests (points at a stub script) — production relies on
  // `sudo` being on PATH plus a narrowly-scoped sudoers rule that allows the
  // `fairpos` service user to run `timedatectl set-time` without a password
  // (see docs/Installationsanleitung.md, "Systemzeit manuell setzen"). Task
  // #60 — the service process itself has no permission to change the system
  // clock (no `CAP_SYS_TIME`), by design (see Abschnitt 4 der
  // Installationsanleitung).
  sudoPath: process.env['SUDO_PATH'] ?? null,
  // Override point for tests (points at a stub script) — production relies
  // on `lsblk` being on PATH (util-linux, present on every Ubuntu install
  // by default). Used by the SMART health check (Task #87) to enumerate
  // physical disks; unlike the actual SMART query, `lsblk` needs no
  // elevated privileges, so it's invoked directly rather than via `sudo`.
  lsblkPath: process.env['LSBLK_PATH'] ?? 'lsblk',
  // Where an uploaded TLS cert/key pair (Task #66) is staged before the
  // privileged install script copies it into nginx's real config location —
  // this directory must be writable by the unprivileged `fairpos` user
  // (see docs/Installationsanleitung.md, "Reverse-Proxy / TLS"). Overridable
  // for tests, which use a throwaway temp directory instead.
  tlsStagingDir: process.env['TLS_STAGING_DIR'] ?? '/var/lib/fairpos/ssl-staging',
  // Where nginx's currently-installed certificate lives — world-readable
  // (0644), so the unprivileged backend can read it directly (no sudo) just
  // to show its expiry/subject in the admin UI. Overridable for tests.
  tlsCertPath: process.env['TLS_CERT_PATH'] ?? '/etc/nginx/ssl/fairpos.crt',
  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
};
