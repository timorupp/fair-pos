/**
 * Creates the initial admin user.
 * Usage: npm run db:seed -- <name> <password>
 * Safe to run multiple times: does nothing if the user already exists.
 */
import pg from 'pg';
import { hashPassword } from '../auth/password.js';

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

  const result = await client.query(
    `INSERT INTO "user" (name, password_hash, is_admin)
     VALUES ($1, $2, true)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [name, hash],
  );

  if (result.rowCount === 0) {
    console.log(`[seed] user "${name}" already exists — skipped`);
  } else {
    console.log(`[seed] admin user "${name}" created (id: ${result.rows[0]?.id})`);
  }
} finally {
  await client.end();
}
