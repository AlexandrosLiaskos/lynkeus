import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { Ribbon } from "../ribbon/Ribbon";
import { dockStore, resetDock } from "../shared/dock/dock";
import { useAnalysisActions } from "./actions";
import { ANALYSIS_TAB, DISPLACEMENT_STATE } from "./tab";
import { SHEET_TOOLS } from "./series";

/** The Analysis tab as the page holds it: its buttons with their actions. */
function AnalysisTab() {
  return <Ribbon tabs={[ANALYSIS_TAB]} actions={useAnalysisActions()} />;
}

/** The buttons of a group of the tab, in their order. */
function buttonsOf(group: string): HTMLElement[] {
  return within(screen.getByRole("group", { name: group })).getAllByRole("button");
}

beforeEach(resetDock);

test("exactly the buttons of the nine finished tools have an action", () => {
  const actions = renderHook(useAnalysisActions).result.current;
  expect(Object.keys(actions)).toEqual([
    "backscatter-state",
    "backscatter-change",
    "coherence-state",
    "coherence-change",
    "displacement-state",
    "soil-moisture-state",
    "soil-moisture-change",
    "backscatter-series",
    "coherence-series",
  ]);
  expect(Object.keys(actions)).toEqual([...SHEET_TOOLS]);
  const declared = ANALYSIS_TAB.groups.flatMap(({ tools }) => tools.map(({ id }) => id));
  expect(declared).toHaveLength(12);
  for (const tool of SHEET_TOOLS) {
    expect(declared).toContain(tool);
  }
});

test("the tab holds twelve buttons, and none for a tool that no published method gives", () => {
  expect(
    Object.fromEntries(ANALYSIS_TAB.groups.map(({ label, tools }) => [label, tools.map((tool) => tool.label)])),
  ).toEqual({
    Backscatter: ["One date", "Change", "Series", "Thematic map"],
    Coherence: ["One pair", "Change", "Series"],
    "Surface displacement": ["One pair", "Series"],
    "Soil moisture": ["One date", "Change", "Series"],
  });
  expect(ANALYSIS_TAB.groups.flatMap(({ tools }) => tools.map(({ id }) => id))).toEqual([
    "backscatter-state",
    "backscatter-change",
    "backscatter-series",
    "backscatter-map",
    "coherence-state",
    "coherence-change",
    "coherence-series",
    "displacement-state",
    "displacement-series",
    "soil-moisture-state",
    "soil-moisture-change",
    "soil-moisture-series",
  ]);
});

test("the nine finished buttons are active, and every other button of the tab is inactive", () => {
  render(<AnalysisTab />);
  const inactive = Object.fromEntries(
    ANALYSIS_TAB.groups.map(({ label }) => [
      label,
      buttonsOf(label).map((button) => button.getAttribute("aria-disabled") === "true"),
    ]),
  );
  expect(inactive).toEqual({
    Backscatter: [false, false, false, true],
    Coherence: [false, false, false],
    "Surface displacement": [false, true],
    "Soil moisture": [false, false, true],
  });
});

test("the button of a finished tool opens the tool pane of that tool, and an inactive button opens none", async () => {
  render(<AnalysisTab />);
  const [oneDate, change, series] = buttonsOf("Backscatter");
  const [onePair, coherenceChange, coherenceSeries] = buttonsOf("Coherence");
  const [displacement, displacementSeries] = buttonsOf("Surface displacement");
  const [moisture, moistureChange, moistureSeries] = buttonsOf("Soil moisture");
  if (
    !oneDate ||
    !change ||
    !series ||
    !onePair ||
    !coherenceChange ||
    !coherenceSeries ||
    !displacement ||
    !displacementSeries ||
    !moisture ||
    !moistureChange ||
    !moistureSeries
  ) {
    throw new Error("The tab does not hold the buttons of its four groups.");
  }
  const opened = ["backscatter-state", "backscatter-change", "coherence-state"];
  await userEvent.click(oneDate);
  expect(dockStore.get().tools).toEqual(["backscatter-state"]);
  await userEvent.click(change);
  expect(dockStore.get().tools).toEqual(["backscatter-state", "backscatter-change"]);
  await userEvent.click(onePair);
  expect(dockStore.get().tools).toEqual(opened);
  await userEvent.click(coherenceChange);
  expect(dockStore.get().tools).toEqual([...opened, "coherence-change"]);
  await userEvent.click(moisture);
  expect(dockStore.get().tools).toEqual([...opened, "coherence-change", "soil-moisture-state"]);
  await userEvent.click(moistureChange);
  const maps = [...opened, "coherence-change", "soil-moisture-state", "soil-moisture-change"];
  expect(dockStore.get().tools).toEqual(maps);
  await userEvent.click(series);
  expect(dockStore.get().tools).toEqual([...maps, "backscatter-series"]);
  await userEvent.click(coherenceSeries);
  const all = [...maps, "backscatter-series", "coherence-series"];
  expect(dockStore.get().tools).toEqual(all);
  await userEvent.click(displacementSeries);
  await userEvent.click(moistureSeries);
  expect(dockStore.get().tools).toEqual(all);
  await userEvent.click(displacement);
  expect(dockStore.get().tools).toEqual([...all, "displacement-state"]);
});

test("the button One pair of Surface displacement says in one sentence what its map shows", () => {
  const group = ANALYSIS_TAB.groups.find(({ label }) => label === "Surface displacement");
  expect(group?.tools.map(({ id, description }) => [id, description])).toEqual([
    ["displacement-state", DISPLACEMENT_STATE],
    ["displacement-series", "Plots the surface displacement of many pairs of dates, at a point or for the area."],
  ]);
  expect(DISPLACEMENT_STATE).toBe(
    "Maps the movement of the ground toward or away from the radar between the two dates of one pair.",
  );
  expect(DISPLACEMENT_STATE).toMatch(/^[A-Z][^.]*\.$/);
});

test("the buttons of the three new tools say in one sentence what the tool maps", () => {
  const described = Object.fromEntries(
    ANALYSIS_TAB.groups.flatMap(({ tools }) => tools.map(({ id, description }) => [id, description])),
  );
  expect(described["coherence-change"]).toBe(
    "Maps the change in interferometric coherence between two pairs of dates.",
  );
  expect(described["soil-moisture-state"]).toBe("Maps the soil moisture of one date.");
  expect(described["soil-moisture-change"]).toBe("Maps the change in soil moisture between two dates.");
});

test("the buttons of the two Series tools say in one sentence what the tool plots", () => {
  const described = Object.fromEntries(
    ANALYSIS_TAB.groups.flatMap(({ tools }) => tools.map(({ id, description }) => [id, description])),
  );
  expect(described["backscatter-series"]).toBe(
    "Plots the radar backscatter of many dates, at a point or for the area.",
  );
  expect(described["coherence-series"]).toBe(
    "Plots the interferometric coherence of many pairs of dates, at a point or for the area.",
  );
});
