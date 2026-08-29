/**
 * Fastify type augmentations for this project.
 *
 * Adds the authenticated-user slots to FastifyRequest. Routes guarded by
 * `authenticateAdmin` read `request.adminUser`; routes guarded by
 * `authenticateRegister` read `request.registerUser`. Since Task #90 both
 * preHandlers resolve the same underlying `session` row (see
 * `auth/session.ts`) — the two separate fields are kept only so the many
 * existing route handlers referencing them didn't all need renaming.
 */
import type { User } from '@fairpos/shared';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated admin user. Populated by `authenticateAdmin`. */
    adminUser: User;
    /** Authenticated register-session user. Populated by `authenticateRegister`. */
    registerUser: User;
    /** Primary key of the current session row. Populated by either preHandler. */
    sessionId: string;
  }
}
