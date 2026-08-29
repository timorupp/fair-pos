/**
 * Typed API client for all backend endpoints.
 * All functions throw an Error with a German message on failure.
 */
import type {
  User, Article, ArticleCategory, Printer, Register, ProductOption,
  CancellationReason, Event, CashTransaction, RegisterLayout, RegisterLayoutSlot,
  DiningTable,
} from '@fairpos/shared';

/** Snapshot of TSE health/status, mirroring `packages/backend/src/tse/types.ts`. */
export interface TseInfo {
  hasPassedSelfTest: boolean;
  hasValidTime: boolean;
  startedTransactions: number;
  maxStartedTransactions: number;
  remainingSignatures: number;
  maxSignatures: number;
  /** Unix seconds. */
  certificateExpirationDate: number;
  /** Seconds until the next mandatory self test. */
  timeUntilNextSelfTest: number;
  /** Seconds until the next mandatory time synchronization. */
  timeUntilNextTimeSynchronization: number;
  tseCertificationId: string;
  formFactor: string;
  /** Hex-encoded TSE serial number. */
  tseSerialNumber: string;
  /** Signature algorithm used by the TSE, e.g. `ecdsa-plain-SHA384`. */
  signatureAlgorithm: string;
  /** Log-time format used by the TSE, e.g. `unixTime`. */
  logTimeFormat: string;
  /** Base64-encoded public key, extracted from the TSE's certificate. */
  publicKey: string;
}

/** Response shape of `GET /api/admin/tse/status`. */
export interface TseStatus {
  configured: boolean;
  info?: TseInfo;
  error?: string;
}

/** One currently-mounted removable filesystem — a candidate TSE mount point. */
export interface TseMountCandidate {
  mountPoint: string;
  device: string;
}

/** Sends a JSON request to the backend and returns the parsed response. Exported for testing. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const error = new Error((data['error'] as string | undefined) ?? 'Unbekannter Fehler');
    // Attaches any other structured fields from the error body (e.g. the
    // admin step-up's `needs_admin_verification`) so callers that need more
    // than the message can inspect them — `error`/`message` are excluded so a
    // same-named field in the response body can never clobber the Error's
    // own `.message` we just built above.
    const { error: _error, message: _message, ...extra } = data;
    Object.assign(error, extra);
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** All available API calls, grouped by domain. */
export const api = {
  /**
   * Authentication endpoints (Task #90). Everyone logs in the same way, via
   * `auth.pin()` — there's a single session, not two separate cookies.
   * `auth.admin.*` is the additional "Systemverwaltung" step-up (password)
   * that marks that same session as admin-verified; `auth.register.*` works
   * for any logged-in user regardless of that step-up.
   */
  auth: {
    /**
     * PIN login (Task #90) — the only way in, admin or not. Identifies and
     * authenticates in one step (no separate username). Sets the session
     * cookie; lands everyone on the Kassenauswahl.
     */
    pin: (pin: string): Promise<User> => request('POST', '/auth/pin', { pin }),

    admin: {
      /**
       * The "Systemverwaltung" step-up — checks the admin's password and
       * marks the *current* session (from the PIN login above) as
       * verified, once per session. Throws (401) on a wrong password, or
       * (403) if the current session's user isn't `is_admin`.
       */
      verify: (password: string): Promise<{ ok: boolean }> =>
        request('POST', '/auth/admin/verify', { password }),

      /** Returns the current admin user, or throws when the session hasn't passed the step-up yet. */
      me: (): Promise<User> =>
        request('GET', '/auth/admin/me'),
    },

    register: {
      /** Returns the current user, or throws when no session exists. Works for any logged-in user, admin or not. */
      me: (): Promise<User> =>
        request('GET', '/auth/register/me'),
    },

    /** Ends the current session (whatever it's being used for — Kassenauswahl or Systemverwaltung). */
    logout: (): Promise<{ ok: boolean }> =>
      request('POST', '/auth/logout'),
  },

  admin: {
    users: {
      /** `has_pin` (Task #90) tells the UI whether a PIN is already assigned, without ever exposing the hash. */
      list: (): Promise<(User & { has_pin: boolean })[]> => request('GET', '/admin/users'),
      create: (data: { name: string; password: string; is_admin: boolean; is_active?: boolean }): Promise<User> =>
        request('POST', '/admin/users', data),
      update: (id: string, data: { name?: string; password?: string; is_admin?: boolean; is_active?: boolean }): Promise<User> =>
        request('PUT', `/admin/users/${id}`, data),
      delete: (id: string): Promise<void> => request('DELETE', `/admin/users/${id}`),
      listRegisters: (id: string): Promise<string[]> =>
        request('GET', `/admin/users/${id}/registers`),
      setRegisters: (id: string, register_ids: string[]): Promise<void> =>
        request('PUT', `/admin/users/${id}/registers`, { register_ids }),

      /** Generates a random candidate PIN — NOT saved yet, see `setPin`. */
      generatePin: (id: string): Promise<{ pin: string }> =>
        request('POST', `/admin/users/${id}/pin/generate`),
      /** Saves a PIN (generated or manually typed/edited), with or without the `XXX-XXX-XXX` hyphens. */
      setPin: (id: string, pin: string): Promise<void> =>
        request('PUT', `/admin/users/${id}/pin`, { pin }),
      /** Prints a PIN slip (user name + PIN) on the default printer — works on any well-formed PIN, saved or not yet. */
      printPin: (id: string, pin: string): Promise<{ print_job_id: string }> =>
        request('POST', `/admin/users/${id}/pin/print`, { pin }),
    },

    sessions: {
      /** Every currently active session (Task #90), newest activity first. */
      list: (): Promise<{
        id: string; user_name: string; is_admin: boolean; admin_verified: boolean;
        created_at: string; last_activity_at: string; user_agent: string | null;
      }[]> => request('GET', '/admin/sessions'),
      /** Forcibly ends one session — that device is logged out on its next request. */
      terminate: (id: string): Promise<void> => request('DELETE', `/admin/sessions/${id}`),
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
      create: (data: { name: string; type: string; printer_id?: string | null; is_active?: boolean }): Promise<Register> =>
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
      status: (): Promise<{ system_serial: string; timezone: string; server_time: string; ip_lockout_count: number }> =>
        request('GET', '/admin/system/status'),
      /**
       * Manually sets the server's system clock (Task #60) — `time` in
       * `YYYY-MM-DDTHH:MM:SS` form, as sent by an
       * `<input type="datetime-local" step="1">`. Requires a sudoers rule on
       * the server (see docs/Installationsanleitung.md); fails with a clear
       * error otherwise.
       */
      setTime: (time: string): Promise<void> => request('PUT', '/admin/system/time', { time }),
      /** Manually sets the server's system timezone (Task #60 follow-up) — an IANA identifier, e.g. `Europe/Berlin`. */
      setTimezone: (timezone: string): Promise<void> => request('PUT', '/admin/system/timezone', { timezone }),
      /**
       * Cleanly shuts the server down (Task #61) — so a normal Vereins-
       * Helfer:in never needs shell access. Requires a sudoers rule on the
       * server (see docs/Installationsanleitung.md); fails with a clear
       * error otherwise. Executes immediately — confirm in the UI first.
       */
      shutdown: (): Promise<void> => request('POST', '/admin/system/shutdown'),
      /** Clears every IP's PIN-login lockout (Task #90) — for a device that locked itself out by mistake. */
      resetIpLockouts: (): Promise<void> => request('POST', '/admin/system/reset-ip-lockouts'),
    },

    backup: {
      /**
       * Kein automatisches/geplantes Backup — der Server läuft nicht 24/7,
       * ein zeitbasierter Trigger würde regelmäßig verpasst (siehe
       * docs/Anforderungen.md "Backup-Konzept"). Nur dieser manuelle Download.
       */
      downloadUrl: (): string => '/api/admin/backup',
    },

    tse: {
      /**
       * On-demand connection test — actually calls into the TSE hardware, so
       * only invoke it from an explicit user action ("TSE testen"), not on page load.
       */
      status: (): Promise<TseStatus> => request('GET', '/admin/tse/status'),
      /** Currently-mounted removable filesystems, for the Mount-Pfad dropdown. */
      candidates: (): Promise<{ candidates: TseMountCandidate[] }> => request('GET', '/admin/tse/candidates'),
      /** "Auto-erkennen" — probes every removable mount and returns the first one that's a real TSE, if any. */
      detect: (): Promise<{ mountPoint: string | null; candidatesTried: number }> =>
        request('POST', '/admin/tse/detect'),
      /** Manually runs self-test + time sync (Task #58/#64) — needed once after a fresh TSE setup, since nothing calls this automatically yet. */
      maintain: (): Promise<{ ok: true }> => request('POST', '/admin/tse/maintain'),
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

      /**
       * DSFinV-K export (CSV files + index.xml, zipped) for this Kassenabschluss.
       * See docs/Rechtliche-Anforderungen.md Abschnitt 6 for the specification.
       */
      dsfinvkUrl: (closingId: string): string => `/api/admin/exports/dsfinvk/${closingId}`,

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
      }): Promise<{
        invoice_id: string;
        receipt_number: number;
        receipt_number_formatted: string;
        receipt_token: string;
        tse_warning: string | null;
      }> => request('POST', '/admin/cancellations', body),
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
       * `status='all'`: every job including completed/cancelled, capped at 500, newest first.
       * `status='done'|'cancelled'`: only that terminal status, newest first.
       * `status` `pending|printing|failed`: exact-match.
       */
      list: (status?: 'pending' | 'printing' | 'failed' | 'done' | 'cancelled' | 'all'): Promise<{
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

    logs: {
      /** Most recent system log entries (Task #64), newest first, capped at 500 rows. `severity`/`category` filter when given. */
      list: (filter?: { severity?: 'info' | 'warning' | 'error' | undefined; category?: string | undefined }): Promise<{
        id: string; createdAt: string; severity: 'info' | 'warning' | 'error'; category: string; message: string;
      }[]> => {
        const params = new URLSearchParams();
        if (filter?.severity) params.set('severity', filter.severity);
        if (filter?.category) params.set('category', filter.category);
        const qs = params.toString();
        return request('GET', `/admin/logs${qs ? `?${qs}` : ''}`);
      },

      /** Distinct categories seen so far, for the filter dropdown. */
      categories: (): Promise<string[]> => request('GET', '/admin/logs/categories'),
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
          id: string; receipt_number: number; receipt_number_formatted: string;
          receipt_type: string;
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

      /** TSE outage log (Task #72) — not event-scoped, newest first, capped at 500 rows. */
      tseOutages: (): Promise<{
        id: string; started_at: string; ended_at: string | null; reason: string;
      }[]> => request('GET', '/admin/reports/tse-outages'),
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

    /**
     * Posts a checkout. Returns the new invoice id + receipt number + token.
     * `tse_warning` is set (invoice still created successfully) when a
     * configured TSE failed to sign the sale — the sale is never blocked on a
     * TSE failure, see docs/TSE-Integration.md → "TSE-Ausfall".
     */
    checkout: (registerId: string, positions: { article_id: string; quantity: number }[]): Promise<{
      invoice_id: string; receipt_number: number; receipt_number_formatted: string;
      receipt_token: string; slip_printer_missing: boolean; tse_warning: string | null;
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

    /**
     * Places a new order at the given table. Prints bestellbons via the print worker.
     * `tse_warning` is set (order still placed) when the AVBestellung couldn't be signed.
     */
    placeOrder: (registerId: string, tableId: string, positions: { article_id: string; quantity: number; options?: string | null }[]): Promise<{
      ok: true; slips_enqueued: number; items_without_printer: number; tse_warning: string | null;
    }> => request('POST', `/register-session/registers/${registerId}/tables/${tableId}/orders`, { positions }),

    /**
     * Charges a (possibly partial) set of open items at the table. Returns the new invoice.
     * `tse_warning` is set (invoice still created) when the Kassenbeleg-V1 couldn't be signed.
     */
    chargeTable: (registerId: string, tableId: string, quantities: { group_key: string; count: number }[]): Promise<{
      invoice_id: string; receipt_number: number; receipt_number_formatted: string;
      receipt_token: string; items_charged: number; tse_warning: string | null;
    }> => request('POST', `/register-session/registers/${registerId}/tables/${tableId}/checkout`, { quantities }),

    /**
     * Cancels or marks-as-free a (possibly partial) set of open items at the table.
     * `tse_warning` is set (cancellation still applied) when the AVSonstige couldn't be signed.
     */
    cancelAtTable: (registerId: string, tableId: string, quantities: { group_key: string; count: number }[], cancellationReasonId: string): Promise<{
      items_cancelled: number; booking_type: 'cancellation' | 'free_of_charge'; tse_warning: string | null;
    }> => request('POST', `/register-session/registers/${registerId}/tables/${tableId}/cancel`, {
      quantities, cancellation_reason_id: cancellationReasonId,
    }),
  },
};
