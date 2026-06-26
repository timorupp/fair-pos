/**
 * Fastify type augmentations for this project.
 *
 * Adds the two authenticated-user slots to FastifyRequest. Routes guarded by
 * `authenticateAdmin` read `request.adminUser`; routes guarded by
 * `authenticateRegister` read `request.registerUser`. Both sessions can be
 * active concurrently, but each request typically uses just one.
 */
import type { User } from '@fairpos/shared';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated admin user. Populated by `authenticateAdmin`. */
    adminUser: User;
    /** Authenticated register-session user. Populated by `authenticateRegister`. */
    registerUser: User;
  }
}
