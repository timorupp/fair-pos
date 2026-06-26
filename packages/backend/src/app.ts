/**
 * Fastify application factory.
 * Registers plugins and routes; serves the compiled SvelteKit SPA as static files.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
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
import { layoutsAdminRoute } from './routes/admin/layouts.js';
import { tablesRoutes } from './routes/admin/tables.js';
import { systemAdminRoute } from './routes/admin/system.js';
import { reportsAdminRoute } from './routes/admin/reports.js';
import { closingsAdminRoute } from './routes/admin/closings.js';
import { exportsAdminRoute } from './routes/admin/exports.js';
import { invoicesAdminRoute } from './routes/admin/invoices.js';
import { cancellationsAdminRoute } from './routes/admin/cancellations.js';
import { logoAdminRoute } from './routes/admin/logo.js';
import { qrAdminRoute } from './routes/admin/qr.js';
import { printJobsAdminRoute } from './routes/admin/print-jobs.js';
import { receiptRoutes } from './routes/receipt.js';
import { registerSessionRoutes } from './routes/register-session.js';

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

  // Multipart parsing is only needed by the logo-upload endpoint. The plugin
  // accepts uploads up to 2 MiB to match the limit enforced in `logo.ts`.
  await app.register(fastifyMultipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });

  // Decorate the request with two independent user slots — one per session type.
  // Populated by the matching preHandler (`authenticateAdmin` / `authenticateRegister`).
  // Cast needed because decorateRequest expects the declared type, not null.
  app.decorateRequest('adminUser', null as unknown as import('@fairpos/shared').User);
  app.decorateRequest('registerUser', null as unknown as import('@fairpos/shared').User);

  // Public receipt PDF route — registered BEFORE the static-file plugin so the
  // explicit `/receipt/:token` path is matched ahead of the SPA fallback.
  await app.register(receiptRoutes);

  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: '/',
  });

  await app.register(
    async (api) => {
      await api.register(healthRoute);
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(registerSessionRoutes, { prefix: '/register-session' });
      await api.register(async (admin) => {
        await admin.register(usersAdminRoute, { prefix: '/users' });
        await admin.register(categoriesAdminRoute, { prefix: '/categories' });
        await admin.register(articlesAdminRoute, { prefix: '/articles' });
        await admin.register(printersAdminRoute, { prefix: '/printers' });
        await admin.register(registersAdminRoute, { prefix: '/registers' });
        await admin.register(eventsAdminRoute, { prefix: '/events' });
        await admin.register(cancellationReasonsAdminRoute, { prefix: '/cancellation-reasons' });
        await admin.register(settingsAdminRoute, { prefix: '/settings' });
        await admin.register(layoutsAdminRoute, { prefix: '/layouts' });
        await admin.register(tablesRoutes, { prefix: '/tables' });
        await admin.register(systemAdminRoute, { prefix: '/system' });
        await admin.register(reportsAdminRoute, { prefix: '/reports' });
        await admin.register(closingsAdminRoute);
        await admin.register(exportsAdminRoute, { prefix: '/exports' });
        await admin.register(invoicesAdminRoute, { prefix: '/invoices' });
        await admin.register(cancellationsAdminRoute, { prefix: '/cancellations' });
        await admin.register(logoAdminRoute, { prefix: '/logo' });
        await admin.register(qrAdminRoute);
        await admin.register(printJobsAdminRoute, { prefix: '/print-jobs' });
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
