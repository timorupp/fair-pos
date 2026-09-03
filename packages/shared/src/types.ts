/**
 * Shared TypeScript types used by both frontend and backend.
 * All names follow the English identifiers defined in Dictionary.md.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

/** Type of a cash register, determines which UI is shown to the operator. */
export type RegisterType = 'receipt_register' | 'service_register';

/**
 * VAT category an article/order line belongs to (Task #110) — used instead
 * of a raw percentage so that a future change to the legal rates (e.g. a
 * Regelsteuersatz increase) can never silently misclassify a line as
 * `zero`. The actual percentage for `reduced`/`standard` is looked up from
 * the `vat_rate_reduced`/`vat_rate_standard` system settings; `zero` is
 * always exactly 0 %, no setting needed.
 */
export type TaxCategory = 'zero' | 'reduced' | 'standard';

/** Lifecycle status of a single order item. */
export type OrderItemStatus = 'open' | 'paid' | 'free' | 'cancelled';

/** Booking type of a cancellation reason. */
export type BookingType = 'cancellation' | 'free_of_charge';

/** Receipt type for DSFinV-K BON_TYP mapping. */
export type ReceiptType = 'sales_receipt' | 'cancellation' | 'training';

/** Payment method recorded on an invoice. */
export type PaymentMethod = 'cash' | 'card';

/** Status of a print job in the queue. */
export type PrintJobStatus = 'pending' | 'printing' | 'done' | 'failed';

/** Type of document a print job produces. */
export type PrintJobType = 'order_slip' | 'receipt' | 'daily_closing' | 'test_print' | 'pin_slip';

// ── Domain types ─────────────────────────────────────────────────────────────

/** A system user. Administrators have full access; others operate registers. */
export interface User {
  id: string;
  name: string;
  /** System-Administrator (Task #94) — unrestricted access. */
  is_admin: boolean;
  /** Veranstaltungs-Administrator (Task #94) — access scoped to what's needed for the active event; independent of is_admin, a user can hold either, both, or neither. */
  is_event_admin: boolean;
  /** Deactivated users cannot log in and disappear from register assignment; never anonymized/deleted. */
  is_active: boolean;
  created_at: string;
}

/** A cash register with its type and optional printer assignment. */
export interface Register {
  id: string;
  name: string;
  type: RegisterType;
  printer_id: string | null;
  /** Archived registers disappear from the operator login/register picker but stay in history/exports. */
  is_active: boolean;
  created_at: string;
}

/** Groups articles by type and carries the applicable VAT category (Task #110 — was a free percentage, now one of the three legally possible categories). */
export interface ArticleCategory {
  id: string;
  name: string;
  tax_category: TaxCategory;
  created_at: string;
}

/** A sellable item with price and optional deposit. */
export interface Article {
  id: string;
  category_id: string;
  name: string;
  price: number;
  deposit_price: number | null;
  print_deposit_receipt: boolean;
  /** Skips the Bonkasse self-pickup slip for this article entirely (Task #114) — e.g. for direct-takeaway items or Pfandrückgabe, where nothing needs to be "picked up". No effect on the Bedienungskasse, which never prints this slip type. */
  skip_pickup_slip: boolean;
  printer_id: string | null;
  is_active: boolean;
  created_at: string;
}

/** A selectable option for an article (e.g. "with ketchup"). */
export interface ProductOption {
  id: string;
  article_id: string;
  name: string;
  price_surcharge: number;
}

/** Visibility and booking status of a dining table. */
export type TableStatus = 'active' | 'inactive' | 'hidden';

/** A dining table positioned in the grid-based floor plan. */
export interface DiningTable {
  id: string;
  name: string;
  col_label: string;
  row_label: string;
  col_order: number;
  row_order: number;
  status: TableStatus;
}

/** An ESC/POS network printer. */
export interface Printer {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  is_default: boolean;
  created_at: string;
}

/** One unit of an ordered article. Snapshot fields are immutable after creation. */
export interface OrderItem {
  id: string;
  invoice_id: string | null;
  dining_table_id: string | null;
  register_id: string;
  /** Name of the user who booked the item, snapshotted at booking time (Task #97) — not a live reference, survives user deletion. */
  user_name: string | null;
  article_id: string | null;
  article_name: string;
  article_category_name: string;
  /** Percent, snapshotted at booking time (e.g. 19, 7, 0) — the article's own rate, not including any deposit. */
  tax_rate: number;
  /** VAT category the article's `tax_rate` belonged to at booking time (Task #110), snapshotted alongside `tax_rate` so downstream code never has to re-guess a category from a raw percentage. */
  tax_category: TaxCategory;
  price: number;
  deposit_price: number | null;
  /** Percent the deposit portion of `deposit_price` was taxed at, snapshotted at booking time (Task #113) — always the Regelsteuersatz in effect then, independent of the article's own `tax_rate`. `null` when `deposit_price` is null. */
  deposit_tax_rate: number | null;
  options: string | null;
  status: OrderItemStatus;
  cancellation_reason_id: string | null;
  /** Name of the cancellation reason, snapshotted at cancellation time (Task #111) — not a live reference, survives a later rename of the reason. `null` unless `cancellation_reason_id` is set. */
  cancellation_reason_name: string | null;
  /** Name of the user who cancelled the item, snapshotted at cancellation time (Task #97). */
  cancelled_by_name: string | null;
  created_at: string;
  cancelled_at: string | null;
}

/** A fiscal receipt created at payment time, carrying the TSE signature. */
export interface Invoice {
  id: string;
  register_id: string;
  daily_closing_id: string | null;
  receipt_number: number;
  receipt_type: ReceiptType;
  payment_method: PaymentMethod;
  cancels_invoice_id: string | null;
  cancellation_note: string | null;
  receipt_token: string | null;
  created_at: string;
  tse_transaction_number: number | null;
  tse_start_time: string | null;
  tse_end_time: string | null;
  tse_signature: string | null;
  tse_signature_counter: number | null;
  tse_serial_number: string | null;
}

/** A daily closing record (Z-Bon) for one register. */
export interface DailyClosing {
  id: string;
  register_id: string;
  z_number: number;
  created_at: string;
  /** Name of the user who created the closing, snapshotted at creation time (Task #97) — not a live reference, survives user deletion. */
  created_by_name: string | null;
  is_zero_closing: boolean;
  total_gross: number;
  total_tax_standard: number;
  total_tax_reduced: number;
  total_tax_zero: number;
  total_cash: number;
  total_cancellations: number;
}

/** A configurable reason for cancelling or giving away items free of charge. */
export interface CancellationReason {
  id: string;
  name: string;
  booking_type: BookingType;
  is_active: boolean;
}

/** A configurable article grid layout for a register. */
export interface RegisterLayout {
  id: string;
  name: string;
  grid_cols: number;
  grid_rows: number;
  created_at: string;
}

/** One placed article in a register layout grid. */
export interface RegisterLayoutSlot {
  id: string;
  register_layout_id: string;
  article_id: string;
  article_name: string;
  grid_row: number;
  grid_col: number;
  color: string;
  /** Custom button text for this placement (Task #91 follow-up); falls back to `article_name` when unset. */
  label: string | null;
  /** Temporarily pulls the slot off the Bonkasse/Bedienung grid without losing its position/color/label. */
  hidden: boolean;
}

/**
 * A Veranstaltung — the hierarchy level articles, registers, layouts, the
 * floor plan, invoices and orders belong to (Task #95). `start_time`/
 * `end_time` are informational display fields only; they play no role in
 * scoping which data belongs to the event (that's `event_id`/register
 * ownership) — exactly one event is globally "active" at a time.
 */
export interface Event {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  created_at: string;
  /** Whether this is the currently active event. Only present on `GET /admin/events` responses — derived, not a stored column. */
  is_active?: boolean;
}

/** A manual cash deposit or withdrawal on a register. */
export interface CashTransaction {
  id: string;
  register_id: string;
  /** Name of the user who booked the transaction, snapshotted at booking time (Task #97) — not a live reference, survives user deletion. */
  user_name: string | null;
  type: 'deposit' | 'withdrawal';
  amount: number;
  note: string | null;
  created_at: string;
}
