/**
 * Typed API client for all backend endpoints.
 * All functions throw an Error with a German message on failure.
 */
import type {
  User, Article, ArticleCategory, Printer, Register, ProductOption,
  CancellationReason, Event, CashTransaction,
} from '@fairpos/shared';

/** Sends a JSON request to the backend and returns the parsed response. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Unbekannter Fehler');
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** All available API calls, grouped by domain. */
export const api = {
  auth: {
    /** Authenticate with username and password. Returns the logged-in user. */
    login: (name: string, password: string): Promise<User> =>
      request('POST', '/auth/login', { name, password }),

    /** Exchange a one-time QR token for a session. Returns the logged-in user. */
    token: (token: string): Promise<User> =>
      request('POST', '/auth/token', { token }),

    /** Clear the session cookie. */
    logout: (): Promise<{ ok: boolean }> =>
      request('POST', '/auth/logout'),

    /** Return the currently authenticated user, or throw if not logged in. */
    me: (): Promise<User> =>
      request('GET', '/auth/me'),
  },

  admin: {
    users: {
      list: (): Promise<User[]> => request('GET', '/admin/users'),
      create: (data: { name: string; password: string; is_admin: boolean }): Promise<User> =>
        request('POST', '/admin/users', data),
      update: (id: string, data: { name?: string; password?: string; is_admin?: boolean }): Promise<User> =>
        request('PUT', `/admin/users/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/users/${id}`),
      listRegisters: (id: string): Promise<string[]> =>
        request('GET', `/admin/users/${id}/registers`),
      setRegisters: (id: string, register_ids: string[]): Promise<void> =>
        request('PUT', `/admin/users/${id}/registers`, { register_ids }),
      generateToken: (id: string): Promise<{ token: string; valid_until: string }> =>
        request('POST', `/admin/users/${id}/token`),
    },

    categories: {
      list: (): Promise<ArticleCategory[]> => request('GET', '/admin/categories'),
      create: (data: { name: string; tax_rate: number }): Promise<ArticleCategory> =>
        request('POST', '/admin/categories', data),
      update: (id: string, data: { name?: string; tax_rate?: number }): Promise<ArticleCategory> =>
        request('PUT', `/admin/categories/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/categories/${id}`),
    },

    articles: {
      list: (): Promise<(Article & { category_name: string; tax_rate: number })[]> =>
        request('GET', '/admin/articles'),
      create: (data: {
        name: string; category_id: string; price: number;
        deposit_price?: number | null; printer_id?: string | null; is_active?: boolean;
      }): Promise<Article> => request('POST', '/admin/articles', data),
      update: (id: string, data: Partial<Article>): Promise<Article> =>
        request('PUT', `/admin/articles/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/articles/${id}`),
      listOptions: (id: string): Promise<ProductOption[]> =>
        request('GET', `/admin/articles/${id}/options`),
      createOption: (id: string, data: { name: string; price_surcharge?: number }): Promise<ProductOption> =>
        request('POST', `/admin/articles/${id}/options`, data),
      deleteOption: (id: string, optionId: string): Promise<void> =>
        request('DELETE', `/admin/articles/${id}/options/${optionId}`),
    },

    printers: {
      list: (): Promise<Printer[]> => request('GET', '/admin/printers'),
      create: (data: { name: string; ip_address: string; port?: number; is_default?: boolean }): Promise<Printer> =>
        request('POST', '/admin/printers', data),
      update: (id: string, data: Partial<Printer>): Promise<Printer> =>
        request('PUT', `/admin/printers/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/printers/${id}`),
    },

    registers: {
      list: (): Promise<(Register & { printer_name: string | null })[]> =>
        request('GET', '/admin/registers'),
      get: (id: string): Promise<Register & { printer_name: string | null; total_deposits: number; total_withdrawals: number }> =>
        request('GET', `/admin/registers/${id}`),
      create: (data: { name: string; type: string; printer_id?: string | null }): Promise<Register> =>
        request('POST', '/admin/registers', data),
      update: (id: string, data: Partial<Register>): Promise<Register> =>
        request('PUT', `/admin/registers/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/registers/${id}`),
      listTransactions: (id: string): Promise<CashTransaction[]> =>
        request('GET', `/admin/registers/${id}/transactions`),
      addTransaction: (id: string, data: { type: 'deposit' | 'withdrawal'; amount: number; note?: string }): Promise<CashTransaction> =>
        request('POST', `/admin/registers/${id}/transactions`, data),
    },

    events: {
      list: (): Promise<Event[]> => request('GET', '/admin/events'),
      create: (data: { name: string; start_time: string; end_time: string }): Promise<Event> =>
        request('POST', '/admin/events', data),
      update: (id: string, data: Partial<Event>): Promise<Event> =>
        request('PUT', `/admin/events/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/events/${id}`),
    },

    cancellationReasons: {
      list: (): Promise<CancellationReason[]> => request('GET', '/admin/cancellation-reasons'),
      create: (data: { name: string; booking_type: string; is_active?: boolean }): Promise<CancellationReason> =>
        request('POST', '/admin/cancellation-reasons', data),
      update: (id: string, data: Partial<CancellationReason>): Promise<CancellationReason> =>
        request('PUT', `/admin/cancellation-reasons/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/cancellation-reasons/${id}`),
    },

    settings: {
      get: (): Promise<Record<string, string>> => request('GET', '/admin/settings'),
      save: (data: Record<string, string>): Promise<void> => request('PUT', '/admin/settings', data),
    },
  },
};
