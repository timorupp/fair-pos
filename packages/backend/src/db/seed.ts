/**
 * Creates the initial admin user.
 * Usage: npm run db:seed -- <name> <password>
 * Safe to run multiple times: does nothing if the user already exists.
 *
 * Also assigns a freshly generated PIN (Task #90 — PIN login is the only way
 * in, admin or not; `<password>` is only ever checked again by the admin
 * "Systemverwaltung" step-up). Printed once to the console since it's never
 * stored in recoverable form — note it down, or assign a new one later via
 * the admin UI (Benutzerverwaltung).
 */
import pg from 'pg';
import { hashPassword } from '../auth/password.js';
import { formatPinForDisplay, generateRandomPin, hashPin } from '../auth/pin.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('Missing required environment variable: DATABASE_URL');

const [, , name, password] = process.argv;

if (!name || !password) {
  console.error('Usage: npm run db:seed -- <name> <password>');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const hash = await hashPassword(password);
  const pin = generateRandomPin();

  const result = await client.query(
    `INSERT INTO "user" (name, password_hash, pin_hash, is_admin)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [name, hash, hashPin(pin)],
  );

  if (result.rowCount === 0) {
    console.log(`[seed] user "${name}" already exists — skipped`);
  } else {
    console.log(`[seed] admin user "${name}" created (id: ${result.rows[0]?.id})`);
    console.log(`[seed] PIN: ${formatPinForDisplay(pin)} — notieren, wird nicht erneut angezeigt`);
  }
} finally {
  await client.end();
}
