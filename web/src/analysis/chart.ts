import type { SeriesDescription, SeriesEntry } from "../shared/series";

/** The number of milliseconds of one day. */
const DAY = 86_400_000;

/** Return the number of the day of a date written as year-month-day, counted from 1 January 1970 (UTC). */
export function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
}

/**
 * Return round values for the marks of an axis that holds the values from `low` to `high`: steps of 1, 2 or 5
 * times a power of ten, about `most` of them, the first at or below `low` and the last at or above `high`. Two
 * equal limits are opened by one step of the size of the value.
 */
export function roundMarks(low: number, high: number, most = 6): number[] {
  let [from, to] = [Math.min(low, high), Math.max(low, high)];
  if (from === to) {
    const half = from === 0 ? 1 : Math.abs(from) / 2;
    [from, to] = [from - half, to + half];
  }
  const rough = (to - from) / Math.max(1, most - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((factor) => factor * power >= rough) ?? 10) * power;
  const first = Math.floor(from / step + 1e-9);
  const last = Math.ceil(to / step - 1e-9);
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Array.from({ length: last - first + 1 }, (_, index) => Number(((first + index) * step).toFixed(digits)));
}

/** Write the value of a mark with the decimals that the step of the marks needs. */
export function markWords(value: number, marks: readonly number[]): string {
  const step = marks.length > 1 ? Math.abs((marks[1] ?? 0) - (marks[0] ?? 0)) : 1;
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return value.toFixed(digits).replace("-", "−");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Write a date as its day and its month, as "27 Sep". The year stands in the title of the time axis. */
export function dayWords(date: string): string {
  const [, month = "1", day = "1"] = date.split("-");
  return `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ""}`;
}

/** The size of the drawing in pixels, and the margins that hold the marks and the titles of the two axes. */
export interface Frame {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A mark of an axis: its place on the drawing, in pixels, and its words. */
export interface Mark {
  at: number;
  words: string;
}

/** What is drawn for one entry that has a value: a point for one date, a horizontal segment for a pair. */
export interface Drawn {
  entry: SeriesEntry;
  /** The place of the first date, of the last date and of the value, in pixels. One date has `x1` equal to `x2`. */
  x1: number;
  x2: number;
  y: number;
}

/** The geometry of the chart of a series. */
export interface Chart {
  /** The marks of the value axis, the lowest value first. */
  values: Mark[];
  /** The marks of the time axis, the earliest date first. */
  days: Mark[];
  /** The title of the time axis: "Date" with the year or the years of the series. */
  time: string;
  /** The entries that have a value, the earliest first. An entry without a value is not drawn. */
  drawn: Drawn[];
  /** The points of the line through the entries of one date, as the attribute `points` of a polyline, or "". */
  line: string;
}

/** The width that one mark of the time axis needs, in pixels, for a text of 12 px such as "27 Sep". */
const MARK_WIDTH = 52;

/**
 * Lay out the chart of a series in a frame. The value axis runs over the range of the series when it has one,
 * for example 0 to 1 for a coherence, and otherwise over round values around the values of the entries. The
 * time axis runs from the first to the last date. An entry of one date is a point, and the points are joined by
 * a line in the order of time. An entry of a pair is a horizontal segment from its first to its second date,
 * and the segments are not joined. An entry without a value is left out.
 */
export function chartOf(series: SeriesDescription, frame: Frame): Chart {
  const amounts = series.entries.flatMap((entry) => (entry.value === null ? [] : [entry.value]));
  const marks = series.range
    ? roundMarks(series.range[0], series.range[1])
    : roundMarks(Math.min(...amounts, Infinity), Math.max(...amounts, -Infinity));
  const sound = marks.every(Number.isFinite) && marks.length > 1;
  const [low, high] = sound ? [marks[0] ?? 0, marks.at(-1) ?? 1] : [0, 1];
  const dates = [...new Set(series.entries.flatMap((entry) => entry.dates))].sort();
  const first = dayNumber(dates[0] ?? "1970-01-01");
  const last = dayNumber(dates.at(-1) ?? "1970-01-01");
  const plotWidth = frame.width - frame.left - frame.right;
  const plotHeight = frame.height - frame.top - frame.bottom;
  const x = (date: string) =>
    frame.left + (last === first ? plotWidth / 2 : ((dayNumber(date) - first) / (last - first)) * plotWidth);
  const y = (value: number) => frame.top + (1 - (value - low) / (high - low)) * plotHeight;

  // The marks of the time axis are dates of the series: the first, the last and as many between as have room.
  const room = Math.max(2, Math.floor(plotWidth / MARK_WIDTH));
  const count = Math.min(dates.length, room);
  const chosen =
    count <= 1
      ? dates.slice(0, 1)
      : Array.from(
          { length: count },
          (_, index) => dates[Math.round((index * (dates.length - 1)) / (count - 1))] ?? "",
        );
  const years = [...new Set(dates.map((date) => date.slice(0, 4)))];
  const drawn = series.entries.flatMap((entry): Drawn[] =>
    entry.value === null
      ? []
      : [{ entry, x1: x(entry.dates[0] ?? ""), x2: x(entry.dates.at(-1) ?? ""), y: y(entry.value) }],
  );
  const single = series.entries.every((entry) => entry.dates.length === 1);
  return {
    values: (sound ? marks : [0, 1]).map((value) => ({
      at: y(value),
      words: markWords(value, sound ? marks : [0, 1]),
    })),
    days: [...new Set(chosen)].map((date) => ({ at: x(date), words: dayWords(date) })),
    time: years.length > 1 ? `Date (${years[0] ?? ""} to ${years.at(-1) ?? ""})` : `Date (${years[0] ?? ""})`,
    drawn,
    line:
      single && drawn.length > 1 ? drawn.map((point) => `${point.x1.toFixed(1)},${point.y.toFixed(1)}`).join(" ") : "",
  };
}
