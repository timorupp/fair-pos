/**
 * The one globally active event (Task #95) — every Veranstaltungs-
 * Administrator-scoped view operates against whichever event this points
 * to. Bridges between `system_setting` (source of truth, editable via the
 * admin UI) and `config.activeEventId` (in-memory value read synchronously
 * on hot paths) — same pattern as `tse/settings.ts`.
 */
import { query } from '../db/client.js';
import { config } from '../config.js';

/** The `system_setting` key holding the active event's id. */
const ACTIVE_EVENT_KEY = 'active_event_id';

/** An event as shown in the admin UI. */
export interface EventInfo {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  /** Default register_layout for new receipt registers (Bonkassen) in this event, or `null` if unset. */
  defaultReceiptRegisterLayoutId: string | null;
  /** Default register_layout for new service registers (Bedienungskassen) in this event, or `null` if unset. */
  defaultServiceRegisterLayoutId: string | null;
}

/**
 * Loads the active event id from `system_setting` into `config`. Called
 * once at server startup, same as `loadTseSettingsFromDb`. Migration 0019
 * only seeds this row on an upgrade with pre-existing data — a fresh
 * install legitimately has none yet, until the first System-Administrator
 * creates and activates their own event. `config.activeEventId` simply
 * stays `null` in that case, and callers needing the active event surface a
 * clear error rather than silently picking one.
 */
export async function loadActiveEventFromDb(): Promise<void> {
  const result = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = $1`,
    [ACTIVE_EVENT_KEY],
  );
  config.activeEventId = result.rows[0]?.value ?? null;
}

/**
 * Loads the currently active event's full details, for the admin UI's
 * always-visible "aktive Veranstaltung" indicator.
 *
 * @returns The active event, or `null` if none is configured (should not
 *   happen in practice, see {@link loadActiveEventFromDb}).
 */
export async function getActiveEvent(): Promise<EventInfo | null> {
  if (!config.activeEventId) return null;
  const result = await query<{
    id: string; name: string; start_time: Date; end_time: Date;
    default_receipt_register_layout_id: string | null;
    default_service_register_layout_id: string | null;
  }>(
    `SELECT id, name, start_time, end_time,
            default_receipt_register_layout_id, default_service_register_layout_id
       FROM event WHERE id = $1`,
    [config.activeEventId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id, name: row.name,
    startTime: row.start_time.toISOString(), endTime: row.end_time.toISOString(),
    defaultReceiptRegisterLayoutId: row.default_receipt_register_layout_id,
    defaultServiceRegisterLayoutId: row.default_service_register_layout_id,
  };
}

/**
 * Sets the active event's default register layouts (Task #95) — deliberately
 * separate from general event editing (`events.ts`, System-Administrator
 * only): a Veranstaltungs-Administrator manages register layouts
 * (`layouts.ts`) and needs to be able to pick the default for the *active*
 * event too, without being able to edit events themselves.
 *
 * @param receiptLayoutId - Default layout for receipt registers (Bonkassen), or `null` to unset.
 * @param serviceLayoutId - Default layout for service registers (Bedienungskassen), or `null` to unset.
 * @throws {Error} A German, user-facing message if no event is currently active.
 */
export async function setActiveEventDefaultLayouts(
  receiptLayoutId: string | null, serviceLayoutId: string | null,
): Promise<void> {
  if (!config.activeEventId) {
    throw new Error('Keine Veranstaltung aktiv');
  }
  await query(
    `UPDATE event
        SET default_receipt_register_layout_id = $1,
            default_service_register_layout_id = $2
      WHERE id = $3`,
    [receiptLayoutId, serviceLayoutId, config.activeEventId],
  );
}

/**
 * Switches the active event — validates the event actually exists first,
 * persists to `system_setting`, then updates `config` so the change takes
 * effect immediately without a backend restart.
 *
 * @param eventId - The event to activate.
 * @throws {Error} A German, user-facing message if no such event exists.
 */
export async function setActiveEvent(eventId: string): Promise<void> {
  const exists = await query(`SELECT 1 FROM event WHERE id = $1`, [eventId]);
  if (exists.rowCount === 0) {
    throw new Error('Veranstaltung nicht gefunden');
  }

  await query(
    `INSERT INTO system_setting (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [ACTIVE_EVENT_KEY, eventId],
  );
  config.activeEventId = eventId;
}
