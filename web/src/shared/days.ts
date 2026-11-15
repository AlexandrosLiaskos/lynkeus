/**
 * The short names of the months, in their order. The server writes the titles of the layers that it receives with
 * the same names (`_MONTHS` in `api/src/lynkeus/harmony.py`), and the interface writes every day with them, so a
 * day reads the same in every part of the page and in any language of the browser.
 */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Write the day of a moment, in Coordinated Universal Time, in the form "21 Oct 2026". */
export function utcDay(moment: Date): string {
  const month = MONTHS[moment.getUTCMonth()] ?? "";
  return `${String(moment.getUTCDate())} ${month} ${String(moment.getUTCFullYear())}`;
}
