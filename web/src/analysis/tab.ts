import type { RibbonTab, Tool } from "../ribbon/types";

type Measurement = "backscatter" | "coherence" | "displacement" | "soil-moisture";

/** The name of an analysis tool. The server knows the tool by the same name. */
export type AnalysisToolId = `${Measurement}-${"state" | "change" | "series" | "map"}`;

/**
 * The four tools of a measurement, in the order that every group of the Analysis tab follows. A measurement is
 * made on one date or from one pair of dates.
 */
function tools(measurement: Measurement, quantity: string, from: "date" | "pair"): (Tool & { id: AnalysisToolId })[] {
  const [one, two, many] =
    from === "date"
      ? ["one date", "two dates", "many dates"]
      : ["one pair of dates", "two pairs of dates", "many pairs of dates"];
  return [
    {
      id: `${measurement}-state`,
      label: from === "date" ? "One date" : "One pair",
      icon: "image",
      description: `Maps the ${quantity} of ${one}.`,
    },
    {
      id: `${measurement}-change`,
      label: "Change",
      icon: "autorenew",
      description: `Maps the change in ${quantity} between ${two}.`,
    },
    {
      id: `${measurement}-series`,
      label: "Series",
      icon: "insights",
      description: `Plots the ${quantity} of ${many}, at a point or for the area.`,
    },
    {
      id: `${measurement}-map`,
      label: "Thematic map",
      icon: "grid_view",
      description: `Maps classes that a published algorithm of the NISAR science team derives from the ${quantity}.`,
    },
  ];
}

/** The Analysis tab: one group for each quantity that NISAR measures. */
export const ANALYSIS_TAB: RibbonTab = {
  id: "analysis",
  label: "Analysis",
  groups: [
    { label: "Backscatter", tools: tools("backscatter", "radar backscatter", "date") },
    { label: "Coherence", tools: tools("coherence", "interferometric coherence", "pair") },
    { label: "Surface displacement", tools: tools("displacement", "surface displacement", "pair") },
    { label: "Soil moisture", tools: tools("soil-moisture", "soil moisture", "date") },
  ],
};
