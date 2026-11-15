/** Write a day given as year-month-day in the form "21 Oct 2026". */
export function formatDate(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
