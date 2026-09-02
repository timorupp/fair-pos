import type { FastifyInstance } from 'fastify';
import { query, withTransaction } from '../../db/client.js';
import { hashPassword } from '../../auth/password.js';
import { formatPinForDisplay, generateRandomPin, hashPin, isValidPinFormat, normalizePin } from '../../auth/pin.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { buildPinSlipBlocks } from '../../print/escpos.js';
import { enqueuePrintJob } from '../../print/enqueue.js';
import { renderBlocksToEscPos } from '../../print/blocks.js';

/** User row returned to the client — never includes password_hash/pin_hash. */
interface UserRow {
  id: string;
  name: string;
  is_admin: boolean;
  is_event_admin: boolean;
  is_active: boolean;
  created_at: string;
}

/** List row — adds `has_pin` so the admin UI can show PIN status without ever seeing the hash itself. */
interface UserListRow extends UserRow {
  has_pin: boolean;
}

/**
 * Looks up whether a user is a System-Administrator (Task #94) — used to
 * guard PIN management so a Veranstaltungs-Administrator can't set/print a
 * System-Administrator's PIN and effectively take over their account.
 *
 * @param id - The target user's id.
 * @returns The user's `is_admin` flag, or `null` if no such user exists.
 */
async function isTargetSystemAdmin(id: string): Promise<boolean | null> {
  const result = await query<{ is_admin: boolean }>('SELECT is_admin FROM "user" WHERE id = $1', [id]);
  return result.rows[0]?.is_admin ?? null;
}

/** Admin routes for user management. All routes require admin privileges. */
export async function usersAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/users — list all users ordered by name. */
  app.get('/', async (_req, reply) => {
    const result = await query<UserListRow>(
      `SELECT id, name, is_admin, is_event_admin, is_active, created_at, (pin_hash IS NOT NULL) AS has_pin
         FROM "user" ORDER BY name`,
    );
    return reply.send(result.rows);
  });

  /**
   * POST /api/admin/users — create a new user.
   *
   * A password is only required for admins — everyone logs in via PIN
   * (Task #90, `POST /api/auth/pin`), and the password is only ever checked
   * again for the admin "Systemverwaltung" step-up
   * (`POST /api/auth/admin/verify`), which non-admins never reach.
   * `password_hash` is nullable — a non-admin has none (PIN-only login,
   * Task #90) and `NULL` there is exactly how `PUT /:id` recognizes "never
   * had a real password" when a later request tries to promote the user to
   * admin without also setting one. The PIN itself is set separately via
   * `POST .../:id/pin/generate` or `PUT .../:id/pin` — a brand-new user has
   * none until an admin assigns one.
   */
  app.post('/', async (req, reply) => {
    const body = req.body as {
      name?: string; password?: string; is_admin?: boolean; is_event_admin?: boolean; is_active?: boolean;
    };
    if (!body.name) {
      return reply.status(400).send({ error: 'Name erforderlich' });
    }
    // Task #94: only a System-Administrator may grant System-Administrator
    // rights — otherwise a Veranstaltungs-Administrator could create a new
    // user with is_admin=true and hand themselves full access.
    if (body.is_admin && !req.adminUser.is_admin) {
      return reply.status(403).send({ error: 'Nur ein System-Administrator darf Systemadministrator-Rechte vergeben' });
    }
    // A password is required for either admin level — both need to pass the
    // "Systemverwaltung" step-up (`POST /api/auth/admin/verify`), which
    // checks the password, to ever reach an admin-gated route at all.
    if ((body.is_admin || body.is_event_admin) && !body.password) {
      return reply.status(400).send({ error: 'Passwort erforderlich für Administrator' });
    }

    const hash = body.password ? await hashPassword(body.password) : null;
    try {
      const result = await query<UserRow>(
        `INSERT INTO "user" (name, password_hash, is_admin, is_event_admin, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, is_admin, is_event_admin, is_active, created_at`,
        [body.name, hash, body.is_admin ?? false, body.is_event_admin ?? false, body.is_active ?? true],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Benutzername „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /**
   * PUT /api/admin/users/:id — update name, admin flag, active flag, or password.
   *
   * `is_active` (Task #56) is the archive/deactivate alternative to deletion:
   * a deactivated user can no longer log in (PIN or admin step-up, see
   * `auth.ts`) and disappears from register assignment pickers, but stays
   * fully in the database — no anonymization, only access is blocked.
   *
   * Also refuses self-deactivation and self-demotion (`is_admin: false`) —
   * both would lock the caller out with no API-level way back in if they were
   * the last remaining admin.
   *
   * An admin must always have a real password (checked again for the
   * "Systemverwaltung" step-up) — so promoting a user via `is_admin: true`
   * is refused unless this same request also sets a password, or the user
   * already has one (`password_hash IS NOT NULL`).
   */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string; password?: string; is_admin?: boolean; is_event_admin?: boolean; is_active?: boolean;
    };

    if (id === req.adminUser.id && body.is_active === false) {
      return reply.status(400).send({ error: 'Du kannst dich nicht selbst deaktivieren' });
    }
    if (id === req.adminUser.id && body.is_admin === false) {
      return reply.status(400).send({ error: 'Du kannst dir nicht selbst die Administratorrechte entziehen' });
    }
    // Task #94: changing is_admin at all (grant or revoke) requires being a
    // System-Administrator yourself — otherwise a Veranstaltungs-Administrator
    // could promote themselves (or anyone) to full System-Administrator access.
    if (body.is_admin !== undefined && !req.adminUser.is_admin) {
      return reply.status(403).send({ error: 'Nur ein System-Administrator darf Systemadministrator-Rechte ändern' });
    }
    // Task #94: setting a NEW password for an existing System-Administrator
    // also requires being one yourself — otherwise a Veranstaltungs-Administrator
    // could take over a System-Administrator's account via a password reset,
    // without ever touching is_admin directly.
    if (body.password && !req.adminUser.is_admin) {
      const targetIsSystemAdmin = await isTargetSystemAdmin(id);
      if (targetIsSystemAdmin === null) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      if (targetIsSystemAdmin) {
        return reply.status(403).send({ error: 'Nur ein System-Administrator darf das Passwort eines System-Administrators ändern' });
      }
    }

    // A password is required for either admin level (see the matching check
    // in POST / above) — only relevant here when granting a level the user
    // didn't already have a password for.
    if ((body.is_admin || body.is_event_admin) && !body.password) {
      const existing = await query<{ password_hash: string | null }>(
        'SELECT password_hash FROM "user" WHERE id = $1',
        [id],
      );
      if (existing.rows.length === 0) {
        return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      }
      if (!existing.rows[0]!.password_hash) {
        return reply.status(400).send({ error: 'Passwort erforderlich für Administrator' });
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(body.name); }
    if (body.is_admin !== undefined) { setClauses.push(`is_admin = $${idx++}`); params.push(body.is_admin); }
    if (body.is_event_admin !== undefined) { setClauses.push(`is_event_admin = $${idx++}`); params.push(body.is_event_admin); }
    if (body.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); params.push(body.is_active); }
    if (body.password) {
      const hash = await hashPassword(body.password);
      setClauses.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ error: 'Keine Felder zum Aktualisieren angegeben' });
    }

    params.push(id);
    try {
      const result = await query<UserRow>(
        `UPDATE "user" SET ${setClauses.join(', ')} WHERE id = $${idx}
         RETURNING id, name, is_admin, is_event_admin, is_active, created_at`,
        params,
      );
      if (result.rows.length === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      return reply.send(result.rows[0]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Benutzername „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /**
   * DELETE /api/admin/users/:id — delete a user. Prevents self-deletion.
   *
   * Task #97: historical/fiscal tables (`daily_closing`, `order_item`,
   * `cash_transaction`, `service_order`, `order_cancellation`) no longer hold
   * a foreign key to `user` — they keep a text name-snapshot instead, so a
   * user can be deleted without losing that history. Only `user_register`
   * (register assignments) and `session` (active logins) still reference the
   * user directly, and both are pure operational data with no audit value —
   * cleared explicitly here rather than requiring a logout first.
   *
   * Task #94: deleting a System-Administrator requires being one yourself —
   * otherwise a Veranstaltungs-Administrator could remove every
   * System-Administrator account and become the highest remaining authority.
   */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    if (id === req.adminUser.id) {
      return reply.status(400).send({ error: 'Du kannst deinen eigenen Benutzer nicht löschen' });
    }

    if (!req.adminUser.is_admin) {
      const target = await query<{ is_admin: boolean }>('SELECT is_admin FROM "user" WHERE id = $1', [id]);
      if (target.rows.length === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      if (target.rows[0]!.is_admin) {
        return reply.status(403).send({ error: 'Nur ein System-Administrator darf einen System-Administrator löschen' });
      }
    }

    const result = await withTransaction(async (client) => {
      await client.query('DELETE FROM session WHERE user_id = $1', [id]);
      await client.query('DELETE FROM user_register WHERE user_id = $1', [id]);
      return client.query('DELETE FROM "user" WHERE id = $1 RETURNING id', [id]);
    });
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
    return reply.status(204).send();
  });

  /** GET /api/admin/users/:id/registers — list registers assigned to a user. */
  app.get('/:id/registers', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query<{ register_id: string }>(
      'SELECT register_id FROM user_register WHERE user_id = $1',
      [id],
    );
    return reply.send(result.rows.map((r) => r.register_id));
  });

  /** PUT /api/admin/users/:id/registers — replace the full set of assigned registers. */
  app.put('/:id/registers', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { register_ids?: string[] };
    const ids = body.register_ids ?? [];

    await query('DELETE FROM user_register WHERE user_id = $1', [id]);
    if (ids.length > 0) {
      const values = ids.map((rid, i) => `($1, $${i + 2})`).join(', ');
      await query(`INSERT INTO user_register (user_id, register_id) VALUES ${values}`, [id, ...ids]);
    }
    return reply.status(204).send();
  });

  /**
   * Checks whether `hash` already belongs to some other user's PIN. Can't be
   * a plain unique DB constraint since `pin_hash` is a keyed HMAC, not a
   * secret salted value — see `auth/pin.ts` for why a direct equality lookup
   * is exactly the point of that choice.
   *
   * @param hash - The candidate PIN's hash.
   * @param excludeUserId - The user being assigned this PIN — excluded so
   *   re-saving a user's own unchanged PIN doesn't falsely collide with itself.
   * @returns Whether the hash is already assigned to a different user.
   */
  async function pinHashInUse(hash: string, excludeUserId: string): Promise<boolean> {
    const result = await query(
      'SELECT id FROM "user" WHERE pin_hash = $1 AND id != $2',
      [hash, excludeUserId],
    );
    return result.rows.length > 0;
  }

  /**
   * POST /api/admin/users/:id/pin/generate — generates a random candidate PIN
   * (not yet saved — the admin UI shows it pre-filled in an editable field,
   * `PUT .../:id/pin` actually persists it). Retries on the astronomically
   * unlikely chance of a collision with an existing user's PIN.
   */
  app.post('/:id/pin/generate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const targetIsSystemAdmin = await isTargetSystemAdmin(id);
    if (targetIsSystemAdmin === null) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
    if (targetIsSystemAdmin && !req.adminUser.is_admin) {
      return reply.status(403).send({ error: 'Nur ein System-Administrator darf die PIN eines System-Administrators verwalten' });
    }

    let candidate = generateRandomPin();
    for (let attempt = 0; attempt < 5 && (await pinHashInUse(hashPin(candidate), id)); attempt++) {
      candidate = generateRandomPin();
    }
    return reply.send({ pin: formatPinForDisplay(candidate) });
  });

  /**
   * PUT /api/admin/users/:id/pin — sets (or replaces) a user's PIN, accepting
   * either the generated candidate as-is or a manually typed/edited value
   * (with or without the `XXX-XXX-XXX` hyphens).
   */
  app.put('/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string };
    const targetIsSystemAdmin = await isTargetSystemAdmin(id);
    if (targetIsSystemAdmin === null) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
    if (targetIsSystemAdmin && !req.adminUser.is_admin) {
      return reply.status(403).send({ error: 'Nur ein System-Administrator darf die PIN eines System-Administrators verwalten' });
    }

    const body = req.body as { pin?: string };
    const normalized = normalizePin(body.pin ?? '');
    if (!isValidPinFormat(normalized)) {
      return reply.status(400).send({ error: 'PIN muss aus 9 Zeichen (A-Z, 0-9) bestehen' });
    }

    const hash = hashPin(normalized);
    if (await pinHashInUse(hash, id)) {
      return reply.status(409).send({ error: 'Diese PIN ist bereits einem anderen Benutzer zugewiesen' });
    }

    const result = await query('UPDATE "user" SET pin_hash = $1 WHERE id = $2 RETURNING id', [hash, id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
    return reply.status(204).send();
  });

  /**
   * POST /api/admin/users/:id/pin/print — prints a PIN slip (user name + PIN)
   * on the system-wide default printer. Takes the PIN as plaintext in the
   * request body — the same trust boundary as `/pin/generate` returning it —
   * since `pin_hash` can never be reversed to recover it. Deliberately
   * accepts whatever candidate the admin currently has on screen, whether or
   * not it has been saved yet via `PUT .../pin` (the natural flow is
   * generate/type → print for the employee → save).
   */
  app.post('/:id/pin/print', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { pin?: string };
    const normalized = normalizePin(body.pin ?? '');
    if (!isValidPinFormat(normalized)) {
      return reply.status(400).send({ error: 'PIN muss aus 9 Zeichen (A-Z, 0-9) bestehen' });
    }

    const userResult = await query<{ name: string; is_admin: boolean }>('SELECT name, is_admin FROM "user" WHERE id = $1', [id]);
    const user = userResult.rows[0];
    if (!user) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
    if (user.is_admin && !req.adminUser.is_admin) {
      return reply.status(403).send({ error: 'Nur ein System-Administrator darf die PIN eines System-Administrators verwalten' });
    }

    const printerResult = await query<{ id: string }>(
      `SELECT id FROM printer WHERE is_default = true LIMIT 1`,
    );
    const printer = printerResult.rows[0];
    if (!printer) return reply.status(400).send({ error: 'Kein Standarddrucker konfiguriert' });

    const blocks = buildPinSlipBlocks(user.name, formatPinForDisplay(normalized), new Date());
    const job = await enqueuePrintJob(printer.id, 'pin_slip', renderBlocksToEscPos(blocks), blocks);
    return reply.send({ print_job_id: job.id });
  });
}
