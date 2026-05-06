/**
 * Fastify type augmentations for this project.
 * Adds the authenticated user to FastifyRequest so routes have typed access to it.
 */
import type { User } from '@fairpos/shared';

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated user. Populated by the authenticate preHandler. */
    user: User;
  }
}
