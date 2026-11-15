// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useRef, useState } from "react";
import { unitWords } from "../data/layers";
import type { SeriesDescription } from "../shared/series";
import { chartOf } from "./chart";

/** The height of the chart and the margins that hold the marks and the titles of its axes, in pixels. */
export const FRAME = { height: 200, left: 44, right: 24, top: 24, bottom: 44 } as const;

/** The width of the chart before the pane has stated its own, and the smallest width, in pixels. */
export const FIRST_WIDTH = 264;
export const SMALLEST_WIDTH = 168;

/**
 * The chart of a series: the values against time, drawn as SVG. The value axis carries the unit of the series,
 * and the time axis the dates. An entry of one date is a point, and the points are joined by a line. An entry
 * of a pair of dates is a horizontal segment from its first to its second date. An entry without a value is not
 * drawn. The chart takes the width of its pane, and its texts keep their size of 12 px at every width. The table
 * that the pane shows under the chart gives the same values as text.
 */
export function SeriesChart({ series }: { series: SeriesDescription }) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(FIRST_WIDTH);

  useEffect(() => {
    const element = holder.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.floor(entry?.contentRect.width ?? 0);
      if (measured > 0) {
        setWidth(Math.max(SMALLEST_WIDTH, measured));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { height, left, right, top, bottom } = FRAME;
  const chart = chartOf(series, { ...FRAME, width });
  const floor = height - bottom;
  const end = width - right;

  return (
    <div ref={holder} className="series-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Chart of the series ${series.title}. The table under the chart gives the same values.`}
      >
        <text className="series-chart-text" x={0} y={12}>
          {unitWords(series.unit)}
        </text>
        {chart.values.map((mark) => (
          <g key={`value-${mark.words}`}>
            <line className="series-chart-grid" x1={left} x2={end} y1={mark.at} y2={mark.at} />
            <text className="series-chart-text" x={left - 6} y={mark.at} textAnchor="end" dominantBaseline="middle">
              {mark.words}
            </text>
          </g>
        ))}
        <line className="series-chart-axis" x1={left} x2={left} y1={top} y2={floor} />
        <line className="series-chart-axis" x1={left} x2={end} y1={floor} y2={floor} />
        {chart.days.map((mark) => (
          <g key={`day-${mark.words}-${String(mark.at)}`}>
            <line className="series-chart-axis" x1={mark.at} x2={mark.at} y1={floor} y2={floor + 4} />
            <text className="series-chart-text" x={mark.at} y={floor + 18} textAnchor="middle">
              {mark.words}
            </text>
          </g>
        ))}
        <text className="series-chart-text" x={(left + end) / 2} y={height - 6} textAnchor="middle">
          {chart.time}
        </text>
        {chart.line === "" ? null : <polyline className="series-chart-line" points={chart.line} />}
        {chart.drawn.map(({ entry, x1, x2, y }) =>
          entry.dates.length === 1 ? (
            <circle key={entry.dates.join(" ")} className="series-chart-point" cx={x1} cy={y} r={3} />
          ) : (
            <g key={entry.dates.join(" ")}>
              <line className="series-chart-line" x1={x1} x2={x2} y1={y} y2={y} />
              <circle className="series-chart-point" cx={x1} cy={y} r={2} />
              <circle className="series-chart-point" cx={x2} cy={y} r={2} />
            </g>
          ),
        )}
      </svg>
    </div>
  );
}
