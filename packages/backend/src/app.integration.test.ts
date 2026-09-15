/**
 * Integration tests for app-wide Fastify plugin wiring (`app.ts`) — as
 * opposed to any individual route's own behavior.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from './test/app-helpers.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

describe('baseline security headers (D-077, 2026-09-15)', () => {
  it('sets @fastify/helmet\'s default headers on every response', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });
});
