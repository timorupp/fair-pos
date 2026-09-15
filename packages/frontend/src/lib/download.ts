/**
 * Triggers a browser "Save As" for an already-fetched file, via a
 * momentary object URL and a synthetic click — the standard workaround
 * for saving a `Blob` that didn't come from a plain `<a href>` navigation
 * (e.g. one fetched manually to check for a JSON error first, see
 * `$lib/api.ts`'s `requestFile`).
 *
 * @param blob - The file content.
 * @param filename - Suggested filename for the save dialog.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
