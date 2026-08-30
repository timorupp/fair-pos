/**
 * Copies text to the clipboard, with a fallback for insecure contexts.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS, or
 * `http://localhost`) — everywhere else, including this project's actual
 * production deployment model (plain HTTP over a LAN, e.g.
 * `http://192.168.1.10:3000`, see docs/Installationsanleitung.md), it is
 * `undefined`. Every call site that used it directly either failed silently
 * (`navigator.clipboard?.writeText(...)`) or threw (no optional chaining).
 * The `document.execCommand('copy')` fallback still works outside secure
 * contexts and is the standard workaround for this exact situation.
 *
 * @param text - The text to copy.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy fallback below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}
