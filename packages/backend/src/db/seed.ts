/**
 * Creates the initial admin user, or — if a user with that name already
 * exists but has no PIN yet — assigns one without touching anything else.
 * Usage: npm run db:seed -- <name> <password>
 * Safe to run multiple times.
 *
 * The second case matters for Task #90 upgrades (2026-08-29, D-049): a
 * migration can add the `pin_hash` column, but it can't invent a PIN for a
 * user created before PIN login existed — that admin is otherwise locked
 * out with no way to assign themselves one (PIN is the only way in). This
 * script is the recovery path: existing name + existing (unchanged)
 * password, freshly generated PIN, printed once to the console since it's
 * never stored in recoverable form.
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
  const existing = await client.query<{ id: string; pin_hash: string | null }>(
    'SELECT id, pin_hash FROM "user" WHERE name = $1',
    [name],
  );

  if (existing.rows.length === 0) {
    const hash = await hashPassword(password);
    const pin = generateRandomPin();
    const result = await client.query<{ id: string }>(
      `INSERT INTO "user" (name, password_hash, pin_hash, is_admin) VALUES ($1, $2, $3, true) RETURNING id`,
      [name, hash, hashPin(pin)],
    );
    console.log(`[seed] admin user "${name}" created (id: ${result.rows[0]?.id})`);
    console.log(`[seed] PIN: ${formatPinForDisplay(pin)} — notieren, wird nicht erneut angezeigt`);
  } else if (existing.rows[0]!.pin_hash === null) {
    const pin = generateRandomPin();
    await client.query('UPDATE "user" SET pin_hash = $1 WHERE id = $2', [hashPin(pin), existing.rows[0]!.id]);
    console.log(`[seed] user "${name}" existed without a PIN (Task #90 upgrade) — assigned one, password unchanged`);
    console.log(`[seed] PIN: ${formatPinForDisplay(pin)} — notieren, wird nicht erneut angezeigt`);
  } else {
    console.log(`[seed] user "${name}" already exists with a PIN — skipped`);
  }
} finally {
  await client.end();
}
