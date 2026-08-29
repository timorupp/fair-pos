/**
 * Minimal HTTP client for the end-to-end suite — real network `fetch()`
 * against an already-running FairPOS instance, with just enough cookie-jar
 * behaviour for this app's session model (one cookie per auth namespace,
 * see routes/auth.ts). Deliberately not a general-purpose HTTP client: no
 * retries, no redirects handling beyond fetch's default — the suite talks to
 * a real server and should fail loudly, not paper over flakiness.
 */

/** Parsed response from `request()` — `body` is `undefined` for non-JSON/empty responses. */
export interface E2EResponse<T> {
  status: number;
  body: T;
}

/** Raw response from `requestBinary()`, for PDF/ZIP downloads. */
export interface E2EBinaryResponse {
  status: number;
  buffer: Buffer;
  contentType: string | null;
}

/**
 * One authenticated (or not-yet-authenticated) client session against a
 * FairPOS instance. Use one instance per session namespace (admin vs.
 * register) — they never share cookies, matching routes/auth.ts.
 */
export class E2EClient {
  private readonly cookies = new Map<string, string>();

  /**
   * @param baseUrl - Root URL of the running instance, e.g. `http://localhost:3000`.
   */
  constructor(private readonly baseUrl: string) {}

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private captureCookies(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const pair = raw.split(';')[0]!;
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  /**
   * Sends a JSON request and parses a JSON response (if any).
   *
   * @param method - HTTP method.
   * @param path - Path relative to the API root, e.g. `/api/auth/pin`.
   * @param body - Request body, JSON-encoded if present.
   * @returns The status code and parsed JSON body (`undefined` if the response wasn't JSON).
   */
  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<E2EResponse<T>> {
    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader();
    if (cookie) headers['cookie'] = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    this.captureCookies(res);

    const contentType = res.headers.get('content-type') ?? '';
    const parsed = contentType.includes('application/json') ? await res.json() : undefined;
    return { status: res.status, body: parsed as T };
  }

  /**
   * Sends a request and returns the raw response bytes — for PDF/ZIP
   * downloads, where the body must not be JSON-parsed.
   *
   * @param method - HTTP method.
   * @param path - Path relative to the API root.
   * @returns The status code, raw bytes, and Content-Type header.
   */
  async requestBinary(method: string, path: string): Promise<E2EBinaryResponse> {
    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader();
    if (cookie) headers['cookie'] = cookie;

    const res = await fetch(`${this.baseUrl}${path}`, { method, headers });
    this.captureCookies(res);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buffer, contentType: res.headers.get('content-type') };
  }
}

/**
 * Resolves the target instance's base URL from the environment.
 *
 * @returns `E2E_BASE_URL`, or `http://localhost:3000` if unset.
 */
export function e2eBaseUrl(): string {
  return process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';
}

/**
 * Reads a required environment variable, throwing a clear, actionable error
 * (not a generic "undefined") if it's missing — this suite is meant to be
 * run by whoever just finished an installation, not just by people who
 * already know the env var names.
 *
 * @param name - Environment variable name.
 * @returns Its value.
 */
export function requireE2EEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} ist nicht gesetzt. Siehe src/e2e/README.md für die nötigen Umgebungsvariablen.`,
    );
  }
  return value;
}
