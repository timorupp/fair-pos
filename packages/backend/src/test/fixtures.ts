/**
 * Reusable test fixtures for integration tests.
 *
 * Each helper inserts one row and returns the new id so tests can quickly seed
 * the data they need without writing the same SQL over and over. None of the
 * helpers truncate — pair them with `truncateAllTables()` in `beforeEach`.
 */

import { pool } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { generateRandomPin, hashPin } from '../auth/pin.js';
import { config } from '../config.js';

/**
 * Inserts a `"user"` row. Every user gets a PIN (Task #90 — PIN login is the
 * only way in, admin or not), plus a password for admin users (only ever
 * checked again by the "Systemverwaltung" step-up, `POST /api/auth/admin/verify`).
 *
 * @param overrides - Optional overrides for `name`, `isAdmin`, `isEventAdmin` (Task #94 — Veranstaltungs-Administrator, independent of `isAdmin`), `password` (plaintext, hashed before insert), `pin` (plaintext, hashed before insert), `isActive`.
 * @returns The new user id and the supplied/default name/password/PIN (all plaintext, for use with the test login helpers).
 */
export async function createTestUser(overrides: {
  name?: string;
  isAdmin?: boolean;
  isEventAdmin?: boolean;
  password?: string;
  pin?: string;
  isActive?: boolean;
} = {}): Promise<{ id: string; name: string; password: string; pin: string }> {
  const name = overrides.name ?? `user-${Math.random().toString(36).slice(2, 8)}`;
  const password = overrides.password ?? 'test-password';
  const pin = overrides.pin ?? generateRandomPin();
  const hash = await hashPassword(password);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO "user" (name, password_hash, pin_hash, is_admin, is_event_admin, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, hash, hashPin(pin), overrides.isAdmin ?? false, overrides.isEventAdmin ?? false, overrides.isActive ?? true],
  );
  return { id: result.rows[0]!.id, name, password, pin };
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
 * @param overrides - Optional overrides for `name`, `type`, `printerId`, `layoutId`, `isActive`,
 *   `eventId` (Task #95 — defaults to `config.activeEventId`).
 * @returns The new register id.
 */
export async function createTestRegister(overrides: {
  name?: string;
  type?: 'receipt_register' | 'service_register';
  printerId?: string | null;
  layoutId?: string | null;
  isActive?: boolean;
  eventId?: string | null;
} = {}): Promise<{ id: string; name: string }> {
  const name = overrides.name ?? `register-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO register (name, type, printer_id, layout_id, is_active, event_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      name,
      overrides.type ?? 'receipt_register',
      overrides.printerId ?? null,
      overrides.layoutId ?? null,
      overrides.isActive ?? true,
      overrides.eventId ?? config.activeEventId,
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
  eventId?: string | null;
} = {}): Promise<{ id: string; name: string }> {
  const name = overrides.name ?? `cat-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO article_category (name, tax_rate, event_id) VALUES ($1, $2, $3) RETURNING id`,
    [name, overrides.taxRate ?? 19, overrides.eventId ?? config.activeEventId],
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
  eventId?: string | null;
} = {}): Promise<{ id: string; name: string; categoryId: string }> {
  const eventId = overrides.eventId ?? config.activeEventId;
  const categoryId = overrides.categoryId ?? (await createTestCategory({ taxRate: overrides.taxRate ?? 19, eventId })).id;
  const name = overrides.name ?? `art-${Math.random().toString(36).slice(2, 8)}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO article (category_id, name, price, deposit_price, print_deposit_receipt, printer_id, is_active, event_id)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id`,
    [
      categoryId, name, overrides.price ?? 5,
      overrides.depositPrice ?? null,
      overrides.printDepositReceipt ?? false,
      overrides.printerId ?? null,
      eventId,
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
