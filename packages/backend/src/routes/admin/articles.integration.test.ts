/** Integration tests for DELETE /api/admin/articles/:id — see Task #84. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestArticle, createTestRegister, createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('DELETE /api/admin/articles/:id', () => {
  it('deletes an unused article', async () => {
    const article = await createTestArticle();
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/articles/${article.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
  });

  it('returns 404 for an article that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: '/api/admin/articles/00000000-0000-0000-0000-000000000000',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 409 with a clear message instead of a raw 500 when the article was already sold', async () => {
    const article = await createTestArticle();
    const register = await createTestRegister();
    await pool.query(
      `INSERT INTO order_item (register_id, article_id, article_name, article_category_name, tax_rate, tax_category, price, status)
       VALUES ($1, $2, $3, 'Getränke', 19, 'standard', 5, 'paid')`,
      [register.id, article.id, article.name],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/articles/${article.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/Aktiv/);

    // The article (and its sale) must still exist — the delete was rejected, not partially applied.
    const stillThere = await pool.query('SELECT id FROM article WHERE id = $1', [article.id]);
    expect(stillThere.rowCount).toBe(1);
  });
});
