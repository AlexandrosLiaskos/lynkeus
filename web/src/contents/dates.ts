const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Write the dates of a layer, each given as year-month-day, in the form "9 Oct 2026 and 21 Oct 2026". */
export function formatDates(dates: readonly string[]): string {
  const days = dates.map((date) => DAY.format(new Date(`${date}T00:00:00Z`)));
  return days.length > 2 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1) ?? ""}` : days.join(" and ");
}
