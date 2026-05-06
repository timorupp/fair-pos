import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import { setSession, clearSession } from '../auth/session.js';
import { authenticate } from '../middleware/authenticate.js';

/** User row returned by the login query — includes the password hash for verification. */
interface LoginUserRow {
  id: string;
  name: string;
  is_admin: boolean;
  password_hash: string;
}

/** User row returned after a successful QR token exchange. */
interface UserRow {
  id: string;
  name: string;
  is_admin: boolean;
}

/** Token row returned by the DELETE … RETURNING query during QR token exchange. */
interface TokenRow {
  user_id: string;
}

/** Safe user payload returned to the client — never includes the password hash. */
interface UserResponse {
  id: string;
  name: string;
  is_admin: boolean;
}

/** Authentication routes: password login, QR token login, logout, and session check. */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/auth/login — authenticate with username and password. */
  app.post('/login', async (request, reply) => {
    const body = request.body as { name?: string; password?: string };

    if (!body.name || !body.password) {
      return reply.status(400).send({ error: 'Name und Passwort erforderlich' });
    }

    const result = await query<LoginUserRow>(
      'SELECT id, name, is_admin, password_hash FROM "user" WHERE name = $1',
      [body.name],
    );

    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      // Same message for missing user and wrong password to prevent user enumeration.
      return reply.status(401).send({ error: 'Ungültige Anmeldedaten' });
    }

    setSession(reply, user.id);
    const response: UserResponse = { id: user.id, name: user.name, is_admin: user.is_admin };
    return reply.send(response);
  });

  /** POST /api/auth/token — exchange a one-time QR token for a session. */
  app.post('/token', async (request, reply) => {
    const body = request.body as { token?: string };

    if (!body.token) {
      return reply.status(400).send({ error: 'Token erforderlich' });
    }

    // Delete the token atomically; RETURNING ensures it existed and was not expired.
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

    const userResult = await query<UserRow>(
      'SELECT id, name, is_admin FROM "user" WHERE id = $1',
      [tokenRow.user_id],
    );

    const user = userResult.rows[0];
    if (!user) {
      return reply.status(401).send({ error: 'Benutzer nicht gefunden' });
    }

    setSession(reply, user.id);
    const response: UserResponse = { id: user.id, name: user.name, is_admin: user.is_admin };
    return reply.send(response);
  });

  /** POST /api/auth/logout — clear the session cookie. */
  app.post('/logout', async (_request, reply) => {
    clearSession(reply);
    return reply.send({ ok: true });
  });

  /** GET /api/auth/me — return the currently authenticated user. */
  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const response: UserResponse = {
      id: request.user.id,
      name: request.user.name,
      is_admin: request.user.is_admin,
    };
    return reply.send(response);
  });
}
