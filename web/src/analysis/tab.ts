// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { RibbonTab, Tool, ToolIdOf } from "../ribbon/types";

type Measurement = "backscatter" | "coherence" | "displacement" | "soil-moisture";

/** A kind of analysis tool: a map of one date or pair, a map of change, a series, or a thematic map. */
type Kind = "state" | "change" | "series" | "map";

/**
 * The buttons of a measurement, one for each kind that its group names. A group names its kinds in the order that
 * every group of the Analysis tab follows: `state`, `change`, `series`, `map`. A measurement is made on one date or
 * from one pair of dates. `state` replaces the description of the first button where the name of the quantity alone
 * does not say what the map shows, and `series` replaces the description of the button Series where the chart does not
 * show the quantity at a point or for the area.
 */
function tools<const M extends Measurement, const K extends Kind>(
  measurement: M,
  kinds: readonly K[],
  quantity: string,
  from: "date" | "pair",
  state?: string,
  series?: string,
): (Tool & { id: `${M}-${K}` })[] {
  const [one, two, many] =
    from === "date"
      ? ["one date", "two dates", "many dates"]
      : ["one pair of dates", "two pairs of dates", "many pairs of dates"];
  const buttons: Record<Kind, Omit<Tool, "id">> = {
    state: {
      label: from === "date" ? "One date" : "One pair",
      icon: "image",
      description: state ?? `Maps the ${quantity} of ${one}.`,
    },
    change: {
      label: "Change",
      icon: "autorenew",
      description: `Maps the change in ${quantity} between ${two}.`,
    },
    series: {
      label: "Series",
      icon: "insights",
      description: series ?? `Plots the ${quantity} of ${many}, at a point or for the area.`,
    },
    map: {
      label: "Thematic map",
      icon: "grid_view",
      description: `Maps classes that a published algorithm of the NISAR science team derives from the ${quantity}.`,
    },
  };
  return kinds.map((kind) => ({ id: `${measurement}-${kind}` as const, ...buttons[kind] }));
}

/** What the button One pair of the group Surface displacement does, in the words of its method sheet. */
export const DISPLACEMENT_STATE =
  "Maps the movement of the ground toward or away from the radar between the two dates of one pair.";

/** What the button Series of the group Surface displacement does, in the words of its method sheet. */
export const DISPLACEMENT_SERIES =
  "Plots the movement of the ground at a point over many dates, relative to a reference point.";

/**
 * The Analysis tab: one group for each quantity that NISAR measures. A group holds a button only for a tool that a
 * published method gives. Surface displacement has no Change, because the phase of each pair is measured from its
 * own arbitrary reference, so two pairs cannot be subtracted (`docs/research/analysis-displacement.md`, part 3.3).
 * Only Backscatter has a Thematic map, because no published algorithm of the NISAR science team that derives
 * classes from coherence, surface displacement or soil moisture was found
 * (`docs/research/analysis-thematic-maps.md`).
 */
export const ANALYSIS_TAB = {
  id: "analysis",
  label: "Analysis",
  groups: [
    {
      label: "Backscatter",
      tools: tools("backscatter", ["state", "change", "series", "map"], "radar backscatter", "date"),
    },
    {
      label: "Coherence",
      tools: tools("coherence", ["state", "change", "series"], "interferometric coherence", "pair"),
    },
    {
      label: "Surface displacement",
      tools: tools(
        "displacement",
        ["state", "series"],
        "surface displacement",
        "pair",
        DISPLACEMENT_STATE,
        DISPLACEMENT_SERIES,
      ),
    },
    {
      label: "Soil moisture",
      tools: tools("soil-moisture", ["state", "change", "series"], "soil moisture", "date"),
    },
  ],
} as const satisfies RibbonTab;

/** The name of an analysis tool. The server knows the tool by the same name. */
export type AnalysisToolId = ToolIdOf<typeof ANALYSIS_TAB>;
