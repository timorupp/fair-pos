/**
 * Fastify application factory.
 * Registers plugins and routes; serves the compiled SvelteKit SPA as static files.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { healthRoute } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { usersAdminRoute } from './routes/admin/users.js';
import { categoriesAdminRoute } from './routes/admin/categories.js';
import { articlesAdminRoute } from './routes/admin/articles.js';
import { printersAdminRoute } from './routes/admin/printers.js';
import { registersAdminRoute } from './routes/admin/registers.js';
import { eventsAdminRoute } from './routes/admin/events.js';
import { cancellationReasonsAdminRoute } from './routes/admin/cancellation-reasons.js';
import { settingsAdminRoute } from './routes/admin/settings.js';

/** Absolute path to the compiled frontend SPA. Resolved relative to dist/. */
const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
);

/** Creates and configures the Fastify application instance. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.isDev ? 'info' : 'warn' },
  });

  await app.register(fastifyCookie, {
    secret: config.sessionSecret,
  });

  // Decorate request with a null user slot; populated by the authenticate preHandler.
  // Cast needed because decorateRequest expects the declared type, not null.
  app.decorateRequest('user', null as unknown as import('@fairpos/shared').User);

  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: '/',
  });

  await app.register(
    async (api) => {
      await api.register(healthRoute);
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(async (admin) => {
        await admin.register(usersAdminRoute, { prefix: '/users' });
        await admin.register(categoriesAdminRoute, { prefix: '/categories' });
        await admin.register(articlesAdminRoute, { prefix: '/articles' });
        await admin.register(printersAdminRoute, { prefix: '/printers' });
        await admin.register(registersAdminRoute, { prefix: '/registers' });
        await admin.register(eventsAdminRoute, { prefix: '/events' });
        await admin.register(cancellationReasonsAdminRoute, { prefix: '/cancellation-reasons' });
        await admin.register(settingsAdminRoute, { prefix: '/settings' });
      }, { prefix: '/admin' });
    },
    { prefix: '/api' },
  );

  // SPA fallback: all non-API paths are handled by index.html
  app.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: 'Not found' });
  });

  return app;
}
