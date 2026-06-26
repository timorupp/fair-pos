/** Tests for the API-client request helper using a mocked global fetch. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request } from './api';

/** Helper: replace `globalThis.fetch` with a mock that returns the supplied Response. */
function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => response);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fn;
  return fn;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = originalFetch;
});

describe('request', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('prefixes the path with /api', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await request('GET', '/foo');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/foo');
  });

  it('passes the HTTP method through', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));
    await request('DELETE', '/bar');
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
  });

  it('serialises the body as JSON and sets Content-Type', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));
    await request('POST', '/bar', { name: 'foo' });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"name":"foo"}');
  });

  it('omits the body and Content-Type when no body is given', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));
    await request('GET', '/bar');
    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('sends credentials so the session cookie travels with the request', async () => {
    const fetchMock = mockFetch(new Response('{}', { status: 200 }));
    await request('GET', '/me');
    expect(fetchMock.mock.calls[0]![1].credentials).toBe('include');
  });

  it('parses a JSON response on success', async () => {
    mockFetch(new Response(JSON.stringify({ id: 'x', name: 'foo' }), { status: 200 }));
    const result = await request<{ id: string; name: string }>('GET', '/x');
    expect(result).toEqual({ id: 'x', name: 'foo' });
  });

  it('returns undefined for 204 No-Content', async () => {
    mockFetch(new Response(null, { status: 204 }));
    const result = await request('DELETE', '/x');
    expect(result).toBeUndefined();
  });

  it('throws with the server-provided error message on a non-2xx response', async () => {
    mockFetch(new Response(JSON.stringify({ error: 'Nicht angemeldet' }), { status: 401 }));
    await expect(request('GET', '/x')).rejects.toThrow('Nicht angemeldet');
  });

  it('falls back to a generic message when the error body is malformed', async () => {
    mockFetch(new Response('<html>not json</html>', { status: 500 }));
    await expect(request('GET', '/x')).rejects.toThrow('Unbekannter Fehler');
  });

  it('falls back to a generic message when the error body is missing the error field', async () => {
    mockFetch(new Response(JSON.stringify({ message: 'wrong field' }), { status: 400 }));
    await expect(request('GET', '/x')).rejects.toThrow('Unbekannter Fehler');
  });
});
