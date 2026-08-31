/**
 * Authentication endpoints (Task #90).
 *
 *   POST /api/auth/pin         — PIN → session cookie (everyone, admin or not)
 *   POST /api/auth/admin/verify — password step-up → marks the current session admin_verified
 *   POST /api/auth/logout       — ends the current session
 *   GET  /api/auth/admin/me     — current user, only once admin_verified (401/403 otherwise)
 *   GET  /api/auth/register/me  — current user, any valid session
 *
 * There is only one session type now — `authenticateAdmin` additionally
 * requires `is_admin` + the step-up check, `authenticateRegister` just
 * requires a valid session. See `middleware/authenticate.ts`.
 */
import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import { hashPin, isValidPinFormat, normalizePin } from '../auth/pin.js';
import {
  createSession, clearSessionCookie, getSessionToken, deleteSessionByToken, setAdminVerified,
} from '../auth/session.js';
import { isLockedOut, recordFailedAttempt, recordSuccessfulAttempt } from '../auth/rateLimit.js';
import { authenticateAdmin, authenticateRegister } from '../middleware/authenticate.js';

/** User row looked up by PIN hash. */
interface PinUserRow {
  id: string;
  name: string;
  is_admin: boolean;
  is_event_admin: boolean;
  is_active: boolean;
}

/** Public user payload returned by login / me endpoints. */
interface UserResponse {
  id: string;
  name: string;
  is_admin: boolean;
  is_event_admin: boolean;
}

/**
 * Registers the `/api/auth/*` routes.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/pin — the only login endpoint. The PIN identifies and
   * authenticates in one step (Task #90) — there is no separate username, so
   * a failed attempt can't be attributed to a specific account; rate
   * limiting is per source IP instead (`auth/rateLimit.ts`).
   */
  app.post('/pin', async (request, reply) => {
    const ip = request.ip;
    if (isLockedOut(ip)) {
      return reply.status(429).send({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
    }

    const body = request.body as { pin?: string };
    const normalized = normalizePin(body.pin ?? '');
    if (!isValidPinFormat(normalized)) {
      recordFailedAttempt(ip);
      return reply.status(401).send({ error: 'PIN ungültig' });
    }

    const result = await query<PinUserRow>(
      'SELECT id, name, is_admin, is_event_admin, is_active FROM "user" WHERE pin_hash = $1',
      [hashPin(normalized)],
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      recordFailedAttempt(ip);
      return reply.status(401).send({ error: 'PIN ungültig' });
    }

    recordSuccessfulAttempt(ip);
    await createSession(reply, user.id, request.headers['user-agent']);
    const response: UserResponse = {
      id: user.id, name: user.name, is_admin: user.is_admin, is_event_admin: user.is_event_admin,
    };
    return reply.send(response);
  });

  /**
   * POST /api/auth/admin/verify — the "Systemverwaltung" step-up: checks the
   * admin's password and, on success, marks the *current* session as
   * `admin_verified` (no new session/cookie — same one from the PIN login).
   * Once per session: the frontend only shows this prompt when
   * `admin_verified` isn't set yet.
   */
  app.post('/admin/verify', { preHandler: authenticateRegister }, async (request, reply) => {
    if (!request.registerUser.is_admin && !request.registerUser.is_event_admin) {
      return reply.status(403).send({ error: 'Keine Berechtigung' });
    }
    const body = request.body as { password?: string };
    if (!body.password) {
      return reply.status(400).send({ error: 'Passwort erforderlich' });
    }

    const result = await query<{ password_hash: string }>(
      'SELECT password_hash FROM "user" WHERE id = $1',
      [request.registerUser.id],
    );
    const hash = result.rows[0]?.password_hash;
    if (!hash || !(await verifyPassword(body.password, hash))) {
      return reply.status(401).send({ error: 'Falsches Passwort' });
    }

    await setAdminVerified(request.sessionId);
    return reply.send({ ok: true });
  });

  /** POST /api/auth/logout — ends the current session (whatever it's being used for). */
  app.post('/logout', async (request, reply) => {
    const token = getSessionToken(request);
    if (token) await deleteSessionByToken(token);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  /**
   * GET /api/auth/admin/me — current user, only once the session has passed
   * the admin step-up (see `authenticateAdmin`).
   */
  app.get('/admin/me', { preHandler: authenticateAdmin }, async (request, reply) => {
    const response: UserResponse = {
      id: request.adminUser.id,
      name: request.adminUser.name,
      is_admin: request.adminUser.is_admin,
      is_event_admin: request.adminUser.is_event_admin,
    };
    return reply.send(response);
  });

  /** GET /api/auth/register/me — current user, any valid session. */
  app.get('/register/me', { preHandler: authenticateRegister }, async (request, reply) => {
    const response: UserResponse = {
      id: request.registerUser.id,
      name: request.registerUser.name,
      is_admin: request.registerUser.is_admin,
      is_event_admin: request.registerUser.is_event_admin,
    };
    return reply.send(response);
  });
}
