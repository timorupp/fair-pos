/**
 * Reusable test fixtures for integration tests.
 *
 * Each helper inserts one row and returns the new id so tests can quickly seed
 * the data they need without writing the same SQL over and over. None of the
 * helpers truncate — pair them with `truncateAllTables()` in `beforeEach`.
 */

import { pool } from '../db/client.js';
import { hashPassword } from '../auth/password.js';

/**
 * Inserts a `"user"` row.
 *
 * @param overrides - Optional overrides for `name`, `isAdmin`, `password` (plaintext, hashed before insert).
 * @returns The new user id and the supplied/default name.
 */
export async function createTestUser(overrides: {
  name?: string;
  isAdmin?: boolean;
  password?: string;
} = {}): Promise<{ id: string; name: string; password: string }> {
  const name = overrides.name ?? `user-${Math.random().toString(36).slice(2, 8)}`;
  const password = overrides.password ?? 'test-password';
  const hash = await hashPassword(password);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO "user" (name, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id`,
    [name, hash, overrides.isAdmin ?? false],
  );
  return { id: result.rows[0]!.id, name, password };
}

/**
 * Inserts a `printer` row.
 *
 * @param overrides - Optional overrides for `name`, `ipAddress`, `port`, `isDefault`.
 * @returns The new printer id.
 */
export async function createTestPrinter(overrides: {
  name?: string;
  ipAddress?: string;
  port?: number;
  isDefault?: boolean;
} = {}): Promise<{ id: string; name: string }> {
  const name = overrides.name ?? `printer-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO printer (name, ip_address, port, is_default) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, overrides.ipAddress ?? '127.0.0.1', overrides.port ?? 9100, overrides.isDefault ?? false],
  );
  return { id: result.rows[0]!.id, name };
}

/**
 * Inserts a `register` row.
 *
 * @param overrides - Optional overrides for `name`, `type`, `printerId`, `layoutId`.
 * @returns The new register id.
 */
export async function createTestRegister(overrides: {
  name?: string;
  type?: 'receipt_register' | 'service_register';
  printerId?: string | null;
  layoutId?: string | null;
} = {}): Promise<{ id: string; name: string }> {
  const name = overrides.name ?? `register-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO register (name, type, printer_id, layout_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      name,
      overrides.type ?? 'receipt_register',
      overrides.printerId ?? null,
      overrides.layoutId ?? null,
    ],
  );
  return { id: result.rows[0]!.id, name };
}

/**
 * Assigns a register to a user via the `user_register` table.
 *
 * @param userId - The user.
 * @param registerId - The register.
 */
export async function assignRegisterToUser(userId: string, registerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_register (user_id, register_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, registerId],
  );
}

/**
 * Inserts an `article_category` row.
 *
 * @param overrides - Optional name/taxRate.
 * @returns The new category id and name.
 */
export async function createTestCategory(overrides: {
  name?: string;
  taxRate?: number;
} = {}): Promise<{ id: string; name: string }> {
  const name = overrides.name ?? `cat-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO article_category (name, tax_rate) VALUES ($1, $2) RETURNING id`,
    [name, overrides.taxRate ?? 19],
  );
  return { id: result.rows[0]!.id, name };
}

/**
 * Inserts an `article` row, optionally creating a category in passing.
 *
 * @param overrides - Optional name, price, deposit, categoryId, printerId.
 * @returns The new article id and name.
 */
export async function createTestArticle(overrides: {
  name?: string;
  price?: number;
  depositPrice?: number | null;
  printDepositReceipt?: boolean;
  categoryId?: string;
  printerId?: string | null;
  taxRate?: number;
} = {}): Promise<{ id: string; name: string; categoryId: string }> {
  const categoryId = overrides.categoryId ?? (await createTestCategory({ taxRate: overrides.taxRate ?? 19 })).id;
  const name = overrides.name ?? `art-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO article (category_id, name, price, deposit_price, print_deposit_receipt, printer_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
    [
      categoryId, name, overrides.price ?? 5,
      overrides.depositPrice ?? null,
      overrides.printDepositReceipt ?? false,
      overrides.printerId ?? null,
    ],
  );
  return { id: result.rows[0]!.id, name, categoryId };
}

/**
 * Sets a key/value pair in `system_setting`, replacing any existing entry.
 *
 * @param key - The setting key.
 * @param value - The setting value (string; numeric settings stringified by the caller).
 */
export async function setSystemSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO system_setting (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

/**
 * Seeds the receipt_counter row that production code expects.
 * Equivalent to `initReceiptCounter()` but doesn't depend on existing invoices.
 *
 * @param start - The starting value (the NEXT issued number will be start+1).
 */
export async function seedReceiptCounter(start: number = 0): Promise<void> {
  await pool.query(
    `INSERT INTO system_setting (key, value) VALUES ('receipt_counter', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(start)],
  );
}
