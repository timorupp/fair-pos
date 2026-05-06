/**
 * Reads and validates all required environment variables at startup.
 * Throws immediately if a required variable is missing so the error is obvious.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Validated application configuration derived from environment variables. */
export const config = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  sessionSecret: requireEnv('SESSION_SECRET'),
  databaseUrl: requireEnv('DATABASE_URL'),
  tseMiddlewareUrl: process.env['TSE_MIDDLEWARE_URL'] ?? 'http://localhost:1500',
  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
} as const;
