/** Admin CRUD and generation endpoints for the floor plan (columns, rows, tables). */

import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { makeLabels } from './tables.helpers.js';

/** Shape returned by every endpoint that lists the full floor plan. */
interface FloorPlanRow {
  id: string;
  name: string;
  col_label: string;
  row_label: string;
  col_order: number;
  row_order: number;
  status: 'active' | 'inactive' | 'hidden';
}

/**
 * Loads every dining table joined with its column and row order. Used by all
 * endpoints that return the post-mutation snapshot so the frontend can re-render.
 *
 * @returns Tables sorted by `(col_order, row_order)`.
 */
async function loadFullFloorPlan(): Promise<FloorPlanRow[]> {
  const result = await pool.query<FloorPlanRow>(`
    SELECT t.id, t.name, t.col_label, t.row_label,
           c.col_order, r.row_order, t.status
      FROM dining_table t
      JOIN floor_plan_column c ON c.label = t.col_label
      JOIN floor_plan_row    r ON r.label = t.row_label
     ORDER BY c.col_order, r.row_order
  `);
  return result.rows;
}

/** Registers all `/api/admin/tables/*` routes. */
export async function tablesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/tables — returns every dining table annotated with its
   * column and row order so the frontend can render the grid.
   */
  app.get('/', async (_req, reply) => {
    reply.send(await loadFullFloorPlan());
  });

  /**
   * POST /api/admin/tables/generate — wipes (optionally) the floor plan and
   * generates a fresh `cols × rows` grid based on the supplied labelling and
   * ordering preferences. Columns and rows live in their own tables so each
   * order value is held exactly once.
   *
   * Body:
   *   `{ cols: { count, label_type, order }, rows: { count, label_type, order }, replace }`
   */
  app.post<{
    Body: {
      cols: { count: number; label_type: 'alpha' | 'numeric'; order: 'asc' | 'desc' };
      rows: { count: number; label_type: 'alpha' | 'numeric'; order: 'asc' | 'desc' };
      replace: boolean;
    };
  }>('/generate', async (req, reply) => {
    const { cols, rows, replace } = req.body;
    if (cols.count < 1 || cols.count > 26 || rows.count < 1 || rows.count > 26) {
      return reply.status(400).send({ error: 'Anzahl muss zwischen 1 und 26 liegen.' });
    }

    const colLabels = makeLabels(cols.count, cols.label_type, cols.order);
    const rowLabels = makeLabels(rows.count, rows.label_type, rows.order);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (replace) {
        // CASCADE on dining_table → fk wipes children; clean both axis tables explicitly.
        await client.query('DELETE FROM floor_plan_column');
        await client.query('DELETE FROM floor_plan_row');
      }

      for (let ci = 0; ci < colLabels.length; ci++) {
        await client.query(
          `INSERT INTO floor_plan_column (label, col_order) VALUES ($1, $2)
           ON CONFLICT (label) DO UPDATE SET col_order = EXCLUDED.col_order`,
          [colLabels[ci], ci],
        );
      }
      for (let ri = 0; ri < rowLabels.length; ri++) {
        await client.query(
          `INSERT INTO floor_plan_row (label, row_order) VALUES ($1, $2)
           ON CONFLICT (label) DO UPDATE SET row_order = EXCLUDED.row_order`,
          [rowLabels[ri], ri],
        );
      }
      for (const col of colLabels) {
        for (const row of rowLabels) {
          await client.query(
            `INSERT INTO dining_table (name, col_label, row_label, status)
             VALUES ($1, $2, $3, 'active')
             ON CONFLICT (col_label, row_label) DO NOTHING`,
            [`${col}${row}`, col, row],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    reply.send(await loadFullFloorPlan());
  });

  /**
   * PUT /api/admin/tables/reorder — replaces the order of every column and row
   * in one shot. Each label is rewritten with its index in the supplied array.
   *
   * Body: `{ columns: string[], rows: string[] }` (labels in display order).
   */
  app.put<{
    Body: { columns: string[]; rows: string[] };
  }>('/reorder', async (req, reply) => {
    const { columns, rows } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Two-phase shuffle: temporarily push every order into a "high" range to avoid
      // tripping the UNIQUE(col_order) / UNIQUE(row_order) constraint during the swap.
      await client.query('UPDATE floor_plan_column SET col_order = col_order + 1000');
      await client.query('UPDATE floor_plan_row    SET row_order = row_order + 1000');
      for (let i = 0; i < columns.length; i++) {
        await client.query(
          'UPDATE floor_plan_column SET col_order = $1 WHERE label = $2',
          [i, columns[i]],
        );
      }
      for (let i = 0; i < rows.length; i++) {
        await client.query(
          'UPDATE floor_plan_row SET row_order = $1 WHERE label = $2',
          [i, rows[i]],
        );
      }
      await client.query('COMMIT');
      reply.status(204).send();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  /**
   * PUT /api/admin/tables/:id — updates the name or status of a single dining table.
   *
   * @param id - The table's UUID.
   * @returns The updated row including resolved column/row order.
   */
  app.put<{
    Params: { id: string };
    Body: { name?: string; status?: 'active' | 'inactive' | 'hidden' };
  }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, status } = req.body;
    const result = await pool.query<FloorPlanRow>(`
      WITH updated AS (
        UPDATE dining_table
           SET name   = COALESCE($1, name),
               status = COALESCE($2, status)
         WHERE id = $3
         RETURNING id, name, col_label, row_label, status
      )
      SELECT u.id, u.name, u.col_label, u.row_label,
             c.col_order, r.row_order, u.status
        FROM updated u
        JOIN floor_plan_column c ON c.label = u.col_label
        JOIN floor_plan_row    r ON r.label = u.row_label
    `, [name ?? null, status ?? null, id]);

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Tisch nicht gefunden.' });
    reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/tables/:id — removes one specific dining table. */
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM dining_table WHERE id = $1', [id]);
    if (!rowCount) return reply.status(404).send({ error: 'Tisch nicht gefunden.' });
    reply.status(204).send();
  });

  /**
   * POST /api/admin/tables/columns — appends a fresh column at the right edge.
   * Creates one dining table per existing row at the new column's intersection.
   *
   * Body: `{ label }`
   * @returns The full updated floor plan.
   */
  app.post<{ Body: { label: string } }>('/columns', async (req, reply) => {
    const label = req.body.label?.trim();
    if (!label) return reply.status(400).send({ error: 'Beschriftung erforderlich' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const dup = await client.query('SELECT 1 FROM floor_plan_column WHERE label = $1 LIMIT 1', [label]);
      if (dup.rowCount && dup.rowCount > 0) {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Spalte mit dieser Beschriftung existiert bereits' });
      }
      const nextOrder = await client.query<{ next: number }>(
        'SELECT COALESCE(MAX(col_order), -1) + 1 AS next FROM floor_plan_column',
      );
      await client.query(
        'INSERT INTO floor_plan_column (label, col_order) VALUES ($1, $2)',
        [label, nextOrder.rows[0]!.next],
      );

      // Seed one cell per existing row. If there are no rows yet, fall back to "1".
      const rowsResult = await client.query<{ label: string }>(
        'SELECT label FROM floor_plan_row ORDER BY row_order',
      );
      if (rowsResult.rows.length === 0) {
        await client.query(
          `INSERT INTO floor_plan_row (label, row_order) VALUES ('1', 0)
           ON CONFLICT (label) DO NOTHING`,
        );
        await client.query(
          `INSERT INTO dining_table (name, col_label, row_label, status)
           VALUES ($1, $2, '1', 'active')`,
          [`${label}1`, label],
        );
      } else {
        for (const r of rowsResult.rows) {
          await client.query(
            `INSERT INTO dining_table (name, col_label, row_label, status)
             VALUES ($1, $2, $3, 'active')`,
            [`${label}${r.label}`, label, r.label],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    reply.send(await loadFullFloorPlan());
  });

  /**
   * POST /api/admin/tables/rows — appends a fresh row at the bottom of the grid.
   * Creates one dining table per existing column at the new row's intersection.
   *
   * Body: `{ label }`
   * @returns The full updated floor plan.
   */
  app.post<{ Body: { label: string } }>('/rows', async (req, reply) => {
    const label = req.body.label?.trim();
    if (!label) return reply.status(400).send({ error: 'Beschriftung erforderlich' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const dup = await client.query('SELECT 1 FROM floor_plan_row WHERE label = $1 LIMIT 1', [label]);
      if (dup.rowCount && dup.rowCount > 0) {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Zeile mit dieser Beschriftung existiert bereits' });
      }
      const nextOrder = await client.query<{ next: number }>(
        'SELECT COALESCE(MAX(row_order), -1) + 1 AS next FROM floor_plan_row',
      );
      await client.query(
        'INSERT INTO floor_plan_row (label, row_order) VALUES ($1, $2)',
        [label, nextOrder.rows[0]!.next],
      );

      const colsResult = await client.query<{ label: string }>(
        'SELECT label FROM floor_plan_column ORDER BY col_order',
      );
      if (colsResult.rows.length === 0) {
        await client.query(
          `INSERT INTO floor_plan_column (label, col_order) VALUES ('A', 0)
           ON CONFLICT (label) DO NOTHING`,
        );
        await client.query(
          `INSERT INTO dining_table (name, col_label, row_label, status)
           VALUES ($1, 'A', $2, 'active')`,
          [`A${label}`, label],
        );
      } else {
        for (const c of colsResult.rows) {
          await client.query(
            `INSERT INTO dining_table (name, col_label, row_label, status)
             VALUES ($1, $2, $3, 'active')`,
            [`${c.label}${label}`, c.label, label],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    reply.send(await loadFullFloorPlan());
  });

  /**
   * DELETE /api/admin/tables/columns/:label — deletes the whole column and,
   * by way of `ON DELETE CASCADE`, every dining table that lived in it.
   */
  app.delete<{ Params: { label: string } }>('/columns/:label', async (req, reply) => {
    const { rowCount } = await pool.query('DELETE FROM floor_plan_column WHERE label = $1', [req.params.label]);
    if (!rowCount) return reply.status(404).send({ error: 'Spalte nicht gefunden' });
    reply.status(204).send();
  });

  /**
   * DELETE /api/admin/tables/rows/:label — deletes the whole row and, by way
   * of `ON DELETE CASCADE`, every dining table that lived in it.
   */
  app.delete<{ Params: { label: string } }>('/rows/:label', async (req, reply) => {
    const { rowCount } = await pool.query('DELETE FROM floor_plan_row WHERE label = $1', [req.params.label]);
    if (!rowCount) return reply.status(404).send({ error: 'Zeile nicht gefunden' });
    reply.status(204).send();
  });
}
