// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { SERIES_TOOLS } from "./series";
import { SeriesForm } from "./SeriesForm";
import { SeriesPane } from "./SeriesPane";
import { ToolForm } from "./ToolForm";
import { FINISHED_TOOLS } from "./tools";

/**
 * The tool panes of the Analysis tab: the form of each finished tool, and the pane that shows a series. The
 * page holds them once, on the right side of the map, where a tool pane is drawn, so that the button of a tool
 * can open its pane.
 */
export function AnalysisDialogs() {
  return (
    <>
      {FINISHED_TOOLS.map((tool) => (
        <ToolForm key={tool} tool={tool} />
      ))}
      {SERIES_TOOLS.map((tool) => (
        <SeriesForm key={tool} tool={tool} />
      ))}
      <SeriesPane />
    </>
  );
}
