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
  sessionSecret: requireEnv('SESSION_SECRET'),
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
  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
};
