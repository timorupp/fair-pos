/** Pure date/time formatting helpers shared across admin pages. */

/**
 * Formats an ISO-8601 timestamp for a `<input type="datetime-local">` value,
 * using the browser's LOCAL date/time components — not `toISOString()`
 * (always UTC despite how that name reads), which silently displayed, and
 * then re-saved, a time shifted by the local UTC offset (D-081: 2h off at
 * UTC+2, found live on the Veranstaltungen edit dialog).
 *
 * @param iso - ISO-8601 timestamp (as stored/returned by the API, UTC).
 * @returns `YYYY-MM-DDTHH:mm` in the browser's local timezone.
 */
export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
