/**
 * Integration tests for `loadReceiptByToken`/`loadReceiptById` (T-013)
 * — DB-driven data loading, needs a real Postgres.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';
import { createTestRegister } from '../test/fixtures.js';
import { loadReceiptByToken, loadReceiptById } from './data.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);
beforeEach(async () => { await truncateAllTables(); });

/** Inserts a minimal paid invoice with one order_item, returning its id and receipt_token. */
async function insertInvoice(registerId: string, token: string): Promise<{ id: string }> {
  const inv = await pool.query<{ id: string }>(
    `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token)
     VALUES ($1, 1, 'sales_receipt', 'cash', $2) RETURNING id`,
    [registerId, token],
  );
  const invoiceId = inv.rows[0]!.id;
  await pool.query(
    `INSERT INTO order_item (invoice_id, register_id, article_name, article_category_name, tax_rate, tax_category, price, status)
     VALUES ($1, $2, 'Bier', 'Getränke', 19, 'standard', 5, 'paid')`,
    [invoiceId, registerId],
  );
  return { id: invoiceId };
}

describe('loadReceiptByToken', () => {
  it('loads the receipt for a matching token', async () => {
    const register = await createTestRegister();
    await insertInvoice(register.id, 'AbCdEf123-_token');
    const data = await loadReceiptByToken('AbCdEf123-_token');
    expect(data).not.toBeNull();
    expect(data!.positions).toHaveLength(1);
  });

  it('returns null for an unknown token', async () => {
    await createTestRegister();
    expect(await loadReceiptByToken('does-not-exist')).toBeNull();
  });

  it('is case-sensitive — a differently-cased token does not match', async () => {
    const register = await createTestRegister();
    await insertInvoice(register.id, 'AbCdEf123-_token');
    expect(await loadReceiptByToken('abcdef123-_token')).toBeNull();
    expect(await loadReceiptByToken('ABCDEF123-_TOKEN')).toBeNull();
  });

  it('returns null for an empty-string token', async () => {
    await createTestRegister();
    expect(await loadReceiptByToken('')).toBeNull();
  });
});

describe('loadReceiptById', () => {
  it('loads the receipt for a matching id', async () => {
    const register = await createTestRegister();
    const { id } = await insertInvoice(register.id, 'some-token');
    const data = await loadReceiptById(id);
    expect(data).not.toBeNull();
    expect(data!.positions).toHaveLength(1);
  });

  it('returns null for an id that does not exist', async () => {
    expect(await loadReceiptById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('passes a Bonstorno\'s already-negative order_item.price through unchanged (D-068 — no isCancellation-based sign flip here anymore)', async () => {
    const register = await createTestRegister();
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token)
       VALUES ($1, 1, 'cancellation', 'cash', 'storno-token') RETURNING id`,
      [register.id],
    );
    const invoiceId = inv.rows[0]!.id;
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_name, article_category_name, tax_rate, tax_category, price, status)
       VALUES ($1, $2, 'Bier', 'Getränke', 19, 'standard', -5, 'paid')`,
      [invoiceId, register.id],
    );
    const data = await loadReceiptById(invoiceId);
    expect(data!.isCancellation).toBe(true);
    expect(data!.positions[0]!.unitPrice).toBe(-5);
    expect(data!.totalGross).toBe(-5);
  });
});
