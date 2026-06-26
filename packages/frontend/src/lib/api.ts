/**
 * Typed API client for all backend endpoints.
 * All functions throw an Error with a German message on failure.
 */
import type {
  User, Article, ArticleCategory, Printer, Register, ProductOption,
  CancellationReason, Event, CashTransaction, RegisterLayout, RegisterLayoutSlot,
  DiningTable,
} from '@fairpos/shared';

/** Sends a JSON request to the backend and returns the parsed response. Exported for testing. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
  /**
   * Authentication endpoints. Two namespaces matching the backend's separate
   * session cookies — `auth.admin.*` for username/password login (admin UI) and
   * `auth.register.*` for QR-token login (cash-register UI). Each namespace
   * only touches its own cookie.
   */
  auth: {
    admin: {
      /** Username/password login. Sets the admin_session cookie. */
      login: (name: string, password: string): Promise<User> =>
        request('POST', '/auth/admin/login', { name, password }),

      /** Clears the admin_session cookie. Does not affect the register_session. */
      logout: (): Promise<{ ok: boolean }> =>
        request('POST', '/auth/admin/logout'),

      /** Returns the current admin user, or throws when no admin session exists. */
      me: (): Promise<User> =>
        request('GET', '/auth/admin/me'),
    },

    register: {
      /** Exchanges a one-time QR token for a register_session cookie. */
      token: (token: string): Promise<User> =>
        request('POST', '/auth/register/token', { token }),

      /** Clears the register_session cookie. Does not affect the admin_session. */
      logout: (): Promise<{ ok: boolean }> =>
        request('POST', '/auth/register/logout'),

      /** Returns the current operator, or throws when no register session exists. */
      me: (): Promise<User> =>
        request('GET', '/auth/register/me'),
    },
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
      /** Creates a printer. The first one is auto-promoted to default; the `is_default` field is ignored. */
      create: (data: { name: string; ip_address: string; port?: number }): Promise<Printer> =>
        request('POST', '/admin/printers', data),
      /** Updates name/IP/port. To change the default printer, use `setDefault`. */
      update: (id: string, data: { name?: string; ip_address?: string; port?: number }): Promise<Printer> =>
        request('PUT', `/admin/printers/${id}`, data),
      /** Promotes one printer to default and demotes all others. */
      setDefault: (id: string): Promise<void> =>
        request('POST', `/admin/printers/${id}/set-default`),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/printers/${id}`),
      status: (id: string): Promise<{ online: boolean }> =>
        request('GET', `/admin/printers/${id}/status`),
      testPrint: (id: string): Promise<{ print_job_id: string }> =>
        request('POST', `/admin/printers/${id}/test-print`),
      listJobs: (id: string): Promise<{
        id: string; type: string; status: string; attempts: number;
        created_at: string; last_attempt_at: string | null; error_message: string | null;
      }[]> =>
        request('GET', `/admin/printers/${id}/jobs`),
      deleteJob: (printerId: string, jobId: string): Promise<void> =>
        request('DELETE', `/admin/printers/${printerId}/jobs/${jobId}`),
    },

    registers: {
      list: (): Promise<(Register & { printer_name: string | null })[]> =>
        request('GET', '/admin/registers'),
      get: (id: string): Promise<Register & {
        printer_name: string | null;
        effective_printer_name: string | null;
        total_deposits: number; total_withdrawals: number;
      }> =>
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

    logo: {
      /**
       * URL of the currently stored logo (PNG). Append `?v=…` to bust the cache
       * after upload/delete; the server already sends `Cache-Control: no-store`.
       */
      previewUrl: (): string => '/api/admin/logo/preview.png',

      /**
       * Uploads a logo file via multipart/form-data. Throws when the backend
       * rejects the file (too large, not a valid image, etc.).
       */
      upload: async (file: File): Promise<void> => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/admin/logo', { method: 'POST', body: form, credentials: 'include' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? 'Upload fehlgeschlagen');
        }
      },

      /** Removes the stored logo. No-op if none is configured. */
      remove: (): Promise<void> => request('DELETE', '/admin/logo'),
    },

    system: {
      status: (): Promise<{ system_serial: string; timezone: string; server_time: string; tse: null }> =>
        request('GET', '/admin/system/status'),
    },

    closings: {
      /** Closes the day for the given register, prints the Z-Bon if a printer is assigned. */
      closeRegister: (registerId: string): Promise<{
        closing_id: string; register_id: string; z_number: number;
        is_zero_closing: boolean; print_job_id: string | null;
      }> => request('POST', `/admin/registers/${registerId}/closings`),

      /** Past Z-Bons for the register, newest first. */
      listForRegister: (registerId: string): Promise<{
        closings: {
          id: string; z_number: number;
          created_at: string; business_date: string;
          is_zero_closing: boolean;
          total_gross: number; total_cash: number; total_cancellations: number;
          created_by: string;
        }[];
      }> => request('GET', `/admin/registers/${registerId}/closings`),

      /** Session-authenticated PDF URL for an existing Z-Bon. */
      pdfUrl: (closingId: string): string => `/api/admin/closings/${closingId}/pdf`,

      /** Re-queues an ESC/POS print job for the given Z-Bon. */
      reprint: (closingId: string): Promise<{ print_job_id: string }> =>
        request('POST', `/admin/closings/${closingId}/reprint`),

      /** System-wide shortcut: closes the day on every register. */
      closeAll: (): Promise<{
        closings: { closing_id: string; register_id: string; z_number: number; is_zero_closing: boolean; print_job_id: string | null }[];
      }> => request('POST', '/admin/closings/close-all'),

      /** Pending-Z-Bon summary across every register. Drives the global banner + badges. */
      pending: (): Promise<{
        today: string;
        registers: { register_id: string; register_name: string; pending_days: string[] }[];
        total_pending_registers: number;
        total_pending_days: number;
      }> => request('GET', '/admin/closings/pending'),

      /** Closes every outstanding past day for one register in chronological order. */
      closePending: (registerId: string): Promise<{
        closings: { closing_id: string; register_id: string; z_number: number; is_zero_closing: boolean; print_job_id: string | null }[];
        pending_days_remaining: number;
      }> => request('POST', `/admin/registers/${registerId}/close-pending`),
    },

    cancellations: {
      /**
       * Creates a cross-receipt cancellation invoice on the chosen Bonkasse.
       * Quantities are positive — the resulting invoice carries
       * `receipt_type='cancellation'`, which makes the Z-Bon aggregation
       * subtract the amount from the cash bucket automatically.
       */
      create: (body: {
        register_id: string;
        cancellation_reason_id: string;
        note?: string;
        items: { article_id: string; quantity: number }[];
      }): Promise<{ invoice_id: string; receipt_number: number; receipt_token: string }> =>
        request('POST', '/admin/cancellations', body),
    },

    invoices: {
      /**
       * Re-queues a print job for an already-issued invoice. Used when the original
       * print attempt failed or the customer asks for a paper copy after the fact.
       */
      reprint: (id: string): Promise<{ print_job_id: string }> =>
        request('POST', `/admin/invoices/${id}/reprint`),

      /**
       * Returns the session-authenticated PDF URL for an invoice, suitable for
       * `<a href>` / `<iframe src>`. Distinct from the customer-facing
       * `/receipt/:token` route (which is for QR scans and may be proxied
       * externally).
       *
       * @param id - The invoice primary key.
       * @returns Absolute URL path that the admin browser can navigate to.
       */
      pdfUrl: (id: string): string => `/api/admin/invoices/${id}/pdf`,
    },

    printJobs: {
      /**
       * Print jobs across all printers.
       * Without `status`: non-terminal only (pending/printing/failed) — FIFO order.
       * `status='all'`: every job including completed, capped at 500, newest first.
       * `status='done'`: only completed jobs, newest first.
       * `status` `pending|printing|failed`: exact-match.
       */
      list: (status?: 'pending' | 'printing' | 'failed' | 'done' | 'all'): Promise<{
        id: string; printer_id: string; printer_name: string;
        type: string; status: string; attempts: number;
        reference_id: string | null;
        created_at: string; last_attempt_at: string | null;
        error_message: string | null;
      }[]> => request('GET', `/admin/print-jobs${status ? `?status=${status}` : ''}`),

      /** Cancels a queued or terminally-failed job. Refuses jobs in `printing` status. */
      cancel: (id: string): Promise<void> => request('DELETE', `/admin/print-jobs/${id}`),

      /** Resets a failed job back to `pending` so the worker retries it. */
      retry: (id: string): Promise<{ ok: true }> => request('POST', `/admin/print-jobs/${id}/retry`),

      /**
       * Session-authenticated PDF URL for a print job (currently only meaningful
       * for `receipt`-type jobs). Returns the URL string; the browser handles
       * the actual fetch via `<a>` or `<iframe>`.
       *
       * @param id - The print-job primary key.
       * @returns Absolute URL path that the admin browser can navigate to.
       */
      pdfUrl: (id: string): string => `/api/admin/print-jobs/${id}/pdf`,
    },

    reports: {
      /** List of events for the report selector, with the default-selection hint. */
      events: (): Promise<{
        events: { id: string; name: string; start_time: string; end_time: string }[];
        default_event_id: string | null;
      }> => request('GET', '/admin/reports/events'),

      /** Open positions grouped by table — always "now", `event_id` is ignored. */
      openPositions: (): Promise<{
        tables: {
          table_id: string | null; table_name: string; total_gross: number;
          positions: {
            name: string; options: string | null; qty: number;
            unit_price: number; unit_deposit: number | null;
            tax_rate: number; line_gross: number;
            oldest_order: string;
          }[];
        }[];
      }> => request('GET', '/admin/reports/open-positions'),

      /** Invoices issued during the selected event. */
      invoices: (eventId?: string): Promise<{
        event: { id: string; start: string; end: string } | null;
        invoices: {
          id: string; receipt_number: number; receipt_type: string;
          payment_method: string; created_at: string; register_name: string;
          receipt_token: string | null; total_gross: number;
        }[];
      }> => request('GET', `/admin/reports/invoices${eventId ? `?event_id=${encodeURIComponent(eventId)}` : ''}`),

      /** Single-figure cash balance per register, scoped to the event. */
      cashBalance: (eventId?: string): Promise<{
        event: { id: string; start: string; end: string } | null;
        registers: { id: string; name: string; type: string;
          deposits: number; withdrawals: number; cash_takings: number; balance: number; }[];
      }> => request('GET', `/admin/reports/cash-balance${eventId ? `?event_id=${encodeURIComponent(eventId)}` : ''}`),

      /** Cancelled and free-of-charge items in the event, with per-user summary. */
      cancellations: (eventId?: string): Promise<{
        event: { id: string; start: string; end: string } | null;
        summary: { user_id: string | null; user_name: string; count: number; total: number }[];
        items: {
          id: string; cancelled_at: string | null; created_at: string;
          user_name: string; table_name: string;
          article_name: string; options: string | null;
          price: number; deposit_price: number | null; line_gross: number;
          reason_name: string; booking_type: string;
        }[];
      }> => request('GET', `/admin/reports/cancellations${eventId ? `?event_id=${encodeURIComponent(eventId)}` : ''}`),
    },

    tables: {
      list: (): Promise<DiningTable[]> => request('GET', '/admin/tables'),
      generate: (data: {
        cols: { count: number; label_type: 'alpha' | 'numeric'; order: 'asc' | 'desc' };
        rows: { count: number; label_type: 'alpha' | 'numeric'; order: 'asc' | 'desc' };
        replace: boolean;
      }): Promise<DiningTable[]> => request('POST', '/admin/tables/generate', data),
      reorder: (data: { columns: string[]; rows: string[] }): Promise<void> =>
        request('PUT', '/admin/tables/reorder', data),
      update: (id: string, data: { name?: string; status?: 'active' | 'inactive' | 'hidden' }): Promise<DiningTable> =>
        request('PUT', `/admin/tables/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/tables/${id}`),
      /** Appends a new column at the right edge; returns the full updated grid. */
      addColumn: (label: string): Promise<DiningTable[]> => request('POST', '/admin/tables/columns', { label }),
      /** Appends a new row at the bottom; returns the full updated grid. */
      addRow: (label: string): Promise<DiningTable[]> => request('POST', '/admin/tables/rows', { label }),
      /** Removes every table in the given column. */
      deleteColumn: (label: string): Promise<void> => request('DELETE', `/admin/tables/columns/${encodeURIComponent(label)}`),
      /** Removes every table in the given row. */
      deleteRow: (label: string): Promise<void> => request('DELETE', `/admin/tables/rows/${encodeURIComponent(label)}`),
    },

    layouts: {
      list: (): Promise<(RegisterLayout & { slot_count: number })[]> =>
        request('GET', '/admin/layouts'),
      get: (id: string): Promise<RegisterLayout & { slots: RegisterLayoutSlot[] }> =>
        request('GET', `/admin/layouts/${id}`),
      create: (data: { name: string; grid_cols?: number; grid_rows?: number }): Promise<RegisterLayout> =>
        request('POST', '/admin/layouts', data),
      update: (id: string, data: { name?: string; grid_cols?: number; grid_rows?: number }): Promise<RegisterLayout> =>
        request('PUT', `/admin/layouts/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/layouts/${id}`),
      duplicate: (id: string): Promise<RegisterLayout> =>
        request('POST', `/admin/layouts/${id}/duplicate`),
      saveSlots: (id: string, slots: { article_id: string; grid_row: number; grid_col: number; color: string }[]): Promise<void> =>
        request('PUT', `/admin/layouts/${id}/slots`, { slots }),
    },
  },

  registerSession: {
    /** User + list of assigned registers, each annotated with its pending-Z-Bon state. */
    me: (): Promise<{
      user: User;
      registers: {
        id: string; name: string;
        type: 'receipt_register' | 'service_register';
        printer_id: string | null; layout_id: string | null;
        locked: boolean; pending_days: string[];
      }[];
    }> => request('GET', '/register-session/me'),

    /** Full operating context for one register: register, resolved layout, active articles, lock state. */
    register: (id: string): Promise<{
      register: { id: string; name: string; type: 'receipt_register' | 'service_register'; printer_id: string | null; layout_id: string | null };
      layout: { id: string; name: string; grid_cols: number; grid_rows: number; slots: { article_id: string; grid_row: number; grid_col: number; color: string }[] } | null;
      articles: (Article & { category_name: string; tax_rate: string })[];
      locked: boolean;
      pending_days: string[];
    }> => request('GET', `/register-session/registers/${id}`),

    /** Posts a checkout. Returns the new invoice id + receipt number + token. */
    checkout: (registerId: string, positions: { article_id: string; quantity: number }[]): Promise<{
      invoice_id: string; receipt_number: number; receipt_token: string;
    }> => request('POST', `/register-session/registers/${registerId}/checkout`, { positions }),

    /** Enqueues a print job for the given invoice on the register's assigned printer. */
    print: (invoiceId: string): Promise<{ print_job_id: string }> =>
      request('POST', `/register-session/invoices/${invoiceId}/print`),

    /** URL of the QR-code PNG embedded by the checkout dialog. */
    qrUrl: (invoiceId: string): string => `/api/register-session/invoices/${invoiceId}/qr.png`,

    /** Saalplan view: all visible tables annotated with their occupancy status. */
    floorPlan: (registerId: string): Promise<{
      tables: {
        id: string; name: string;
        col_label: string; row_label: string;
        col_order: number; row_order: number;
        status: 'active' | 'inactive' | 'hidden';
        has_open_items: boolean;
      }[];
    }> => request('GET', `/register-session/registers/${registerId}/floor-plan`),

    /** Product options for an article (used to render the Bedienungskasse option dialog). */
    articleOptions: (articleId: string): Promise<{ id: string; article_id: string; name: string; price_surcharge: number | string }[]> =>
      request('GET', `/register-session/articles/${articleId}/options`),

    /** Active cancellation reasons available to the operator. */
    cancellationReasons: (): Promise<{ id: string; name: string; booking_type: 'cancellation' | 'free_of_charge' }[]> =>
      request('GET', '/register-session/cancellation-reasons'),

    /** Open items at a table, already grouped by (article+options). */
    openItems: (registerId: string, tableId: string): Promise<{
      groups: {
        group_key: string;
        name: string;
        options: string | null;
        unit_price: number;
        unit_deposit: number | null;
        tax_rate: number;
        quantity: number;
        line_total: number;
      }[];
    }> => request('GET', `/register-session/registers/${registerId}/tables/${tableId}/open-items`),

    /** Places a new order at the given table. Prints bestellbons via the print worker. */
    placeOrder: (registerId: string, tableId: string, positions: { article_id: string; quantity: number; options?: string | null }[]): Promise<{
      ok: true; slips_enqueued: number; items_without_printer: number;
    }> => request('POST', `/register-session/registers/${registerId}/tables/${tableId}/orders`, { positions }),

    /** Charges a (possibly partial) set of open items at the table. Returns the new invoice. */
    chargeTable: (registerId: string, tableId: string, quantities: { group_key: string; count: number }[]): Promise<{
      invoice_id: string; receipt_number: number; receipt_token: string; items_charged: number;
    }> => request('POST', `/register-session/registers/${registerId}/tables/${tableId}/checkout`, { quantities }),

    /** Cancels or marks-as-free a (possibly partial) set of open items at the table. */
    cancelAtTable: (registerId: string, tableId: string, quantities: { group_key: string; count: number }[], cancellationReasonId: string): Promise<{
      items_cancelled: number; booking_type: 'cancellation' | 'free_of_charge';
    }> => request('POST', `/register-session/registers/${registerId}/tables/${tableId}/cancel`, {
      quantities, cancellation_reason_id: cancellationReasonId,
    }),
  },
};
