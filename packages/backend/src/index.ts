/**
 * Application entry point.
 * Runs database migrations, then starts the HTTP server and print worker.
 */
import { runMigrations } from './db/migrate.js';
import { buildApp } from './app.js';
import { config } from './config.js';
import { startPrintWorker } from './workers/print-worker.js';
import { ensureSystemSerial, initReceiptCounter } from './system/bootstrap.js';

async function main(): Promise<void> {
  await runMigrations();
  await ensureSystemSerial();
  await initReceiptCounter();

  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });

  startPrintWorker();
}

main().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
