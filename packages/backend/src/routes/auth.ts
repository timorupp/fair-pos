/**
 * Authentication endpoints — two strictly separate paths:
 *
 *   /api/auth/admin/login     (POST) — username + password → admin_session cookie
 *   /api/auth/admin/logout    (POST) — clear admin_session
 *   /api/auth/admin/me        (GET)  — current admin user (401 if no session)
 *
 *   /api/auth/register/token  (POST) — one-time QR token → register_session cookie
 *   /api/auth/register/logout (POST) — clear register_session
 *   /api/auth/register/me     (GET)  — current operator (401 if no session)
 *
 * The two namespaces never read or write each other's cookie. An admin who
 * scans a QR token sees BOTH cookies set in the same browser, but the admin
 * UI still uses the admin cookie and the cash-register UI uses the register one.
 */
import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import {
  setAdminSession, clearAdminSession,
  setRegisterSession, clearRegisterSession,
} from '../auth/session.js';
import { authenticateAdmin, authenticateRegister } from '../middleware/authenticate.js';

/** User row returned by the password-login query. Includes the hash for verification. */
interface LoginUserRow {
  id: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  password_hash: string;
}

/** User row returned after a QR token is exchanged. No hash exposed. */
interface BasicUserRow {
  id: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
}

/** Row returned by the token DELETE…RETURNING query. */
interface TokenRow {
  user_id: string;
}

/** Public user payload returned by login / me endpoints. */
interface UserResponse {
  id: string;
  name: string;
  is_admin: boolean;
}

/**
 * Registers the two authentication namespaces under `/api/auth/admin/*` and
 * `/api/auth/register/*`.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {

  // ── Admin session (username + password) ───────────────────────────────────

  /**
   * POST /api/auth/admin/login — authenticate with username and password.
   * Refuses non-admin users with a uniform 401 to avoid leaking whether the
   * account exists. Also refuses deactivated users (Task #56, `is_active`) —
   * same uniform 401, so a deactivated admin can't distinguish that state
   * from a wrong password.
   */
  app.post('/admin/login', async (request, reply) => {
    const body = request.body as { name?: string; password?: string };
    if (!body.name || !body.password) {
      return reply.status(400).send({ error: 'Name und Passwort erforderlich' });
    }

    const result = await query<LoginUserRow>(
      'SELECT id, name, is_admin, is_active, password_hash FROM "user" WHERE name = $1',
      [body.name],
    );

    const user = result.rows[0];
    if (!user || !user.is_admin || !user.is_active || !(await verifyPassword(body.password, user.password_hash))) {
      // Uniform message: missing user, wrong password, non-admin, or deactivated all → 401.
      return reply.status(401).send({ error: 'Ungültige Anmeldedaten' });
    }

    setAdminSession(reply, user.id);
    const response: UserResponse = { id: user.id, name: user.name, is_admin: user.is_admin };
    return reply.send(response);
  });

  /** POST /api/auth/admin/logout — clears the admin session cookie. */
  app.post('/admin/logout', async (_request, reply) => {
    clearAdminSession(reply);
    return reply.send({ ok: true });
  });

  /** GET /api/auth/admin/me — returns the currently authenticated admin user. */
  app.get('/admin/me', { preHandler: authenticateAdmin }, async (request, reply) => {
    const response: UserResponse = {
      id: request.adminUser.id,
      name: request.adminUser.name,
      is_admin: request.adminUser.is_admin,
    };
    return reply.send(response);
  });

  // ── Register session (QR-token only) ──────────────────────────────────────

  /**
   * POST /api/auth/register/token — exchange a one-time QR token for a register session.
   * The token is deleted atomically with RETURNING so it cannot be reused.
   */
  app.post('/register/token', async (request, reply) => {
    const body = request.body as { token?: string };
    if (!body.token) {
      return reply.status(400).send({ error: 'Token erforderlich' });
    }

    const tokenResult = await query<TokenRow>(
      `DELETE FROM register_access_token
       WHERE token = $1 AND valid_until > now()
       RETURNING user_id`,
      [body.token],
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      return reply.status(401).send({ error: 'Token ungültig oder abgelaufen' });
    }

    const userResult = await query<BasicUserRow>(
      'SELECT id, name, is_admin, is_active FROM "user" WHERE id = $1',
      [tokenRow.user_id],
    );

    const user = userResult.rows[0];
    if (!user || !user.is_active) {
      return reply.status(401).send({ error: 'Benutzer nicht gefunden' });
    }

    setRegisterSession(reply, user.id);
    const response: UserResponse = { id: user.id, name: user.name, is_admin: user.is_admin };
    return reply.send(response);
  });

  /** POST /api/auth/register/logout — clears the register session cookie. */
  app.post('/register/logout', async (_request, reply) => {
    clearRegisterSession(reply);
    return reply.send({ ok: true });
  });

  /** GET /api/auth/register/me — returns the currently authenticated operator. */
  app.get('/register/me', { preHandler: authenticateRegister }, async (request, reply) => {
    const response: UserResponse = {
      id: request.registerUser.id,
      name: request.registerUser.name,
      is_admin: request.registerUser.is_admin,
    };
    return reply.send(response);
  });
}
