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
 * `tseMountPoint`/`tseClientId` are seeded from the environment here but are
 * mutable: `tse/settings.ts` overwrites them from the `system_setting` table
 * (the admin-configurable source of truth) at startup and after every save,
 * so the values used on the hot checkout path stay a synchronous in-memory
 * read even though their canonical storage is the database. See
 * docs/TSE-Integration.md.
 */
export const config = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  sessionSecret: requireEnv('SESSION_SECRET'),
  databaseUrl: requireEnv('DATABASE_URL'),
  // Both optional: environments without a physical TSE attached (local dev,
  // CI, integration tests) simply don't set these, and packages/backend/src/tse
  // throws a clear error only if something actually tries to use the TSE.
  tseMountPoint: process.env['TSE_MOUNT_POINT'] ?? null as string | null,
  tseClientId: process.env['TSE_CLIENT_ID'] ?? null as string | null,
  // Override point for tests — points at a stub script instead of the real,
  // gitignored, hardware-dependent binary. Not meant to be set in production.
  tseCliPath: process.env['TSE_CLI_PATH'] ?? null,
  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
};
