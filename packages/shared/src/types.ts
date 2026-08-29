/**
 * Shared TypeScript types used by both frontend and backend.
 * All names follow the English identifiers defined in Dictionary.md.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

/** Type of a cash register, determines which UI is shown to the operator. */
export type RegisterType = 'receipt_register' | 'service_register';

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
  is_admin: boolean;
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

/** Groups articles by type and carries the applicable VAT rate. */
export interface ArticleCategory {
  id: string;
  name: string;
  tax_rate: number;
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
  user_id: string | null;
  article_id: string | null;
  article_name: string;
  article_category_name: string;
  tax_rate: number;
  price: number;
  deposit_price: number | null;
  options: string | null;
  status: OrderItemStatus;
  cancellation_reason_id: string | null;
  cancelled_by: string | null;
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
  created_by: string | null;
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

/** An event used as a reporting period; does not affect live operations. */
export interface Event {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

/** A manual cash deposit or withdrawal on a register. */
export interface CashTransaction {
  id: string;
  register_id: string;
  user_id: string | null;
  user_name: string | null;
  type: 'deposit' | 'withdrawal';
  amount: number;
  note: string | null;
  created_at: string;
}
