import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { Ribbon } from "../ribbon/Ribbon";
import { dockStore, resetDock } from "../shared/dock/dock";
import { useAnalysisActions } from "./actions";
import { ANALYSIS_TAB } from "./tab";
import { FINISHED_TOOLS } from "./tools";

/** The Analysis tab as the page holds it: its buttons with their actions. */
function AnalysisTab() {
  return <Ribbon tabs={[ANALYSIS_TAB]} actions={useAnalysisActions()} />;
}

/** The buttons of a group of the tab, in their order. */
function buttonsOf(group: string): HTMLElement[] {
  return within(screen.getByRole("group", { name: group })).getAllByRole("button");
}

beforeEach(resetDock);

test("exactly the buttons of the six finished tools have an action", () => {
  const actions = renderHook(useAnalysisActions).result.current;
  expect(Object.keys(actions)).toEqual([
    "backscatter-state",
    "backscatter-change",
    "coherence-state",
    "coherence-change",
    "soil-moisture-state",
    "soil-moisture-change",
  ]);
  expect(Object.keys(actions)).toEqual([...FINISHED_TOOLS]);
  const declared = ANALYSIS_TAB.groups.flatMap(({ tools }) => tools.map(({ id }) => id));
  expect(declared).toHaveLength(16);
  for (const tool of FINISHED_TOOLS) {
    expect(declared).toContain(tool);
  }
});

test("the six finished buttons are active, and every other button of the tab is inactive", () => {
  render(<AnalysisTab />);
  const inactive = Object.fromEntries(
    ANALYSIS_TAB.groups.map(({ label }) => [
      label,
      buttonsOf(label).map((button) => button.getAttribute("aria-disabled") === "true"),
    ]),
  );
  expect(inactive).toEqual({
    Backscatter: [false, false, true, true],
    Coherence: [false, false, true, true],
    "Surface displacement": [true, true, true, true],
    "Soil moisture": [false, false, true, true],
  });
});

test("the button of a finished tool opens the tool pane of that tool, and an inactive button opens none", async () => {
  render(<AnalysisTab />);
  const [oneDate, change, series] = buttonsOf("Backscatter");
  const [onePair, coherenceChange, coherenceSeries] = buttonsOf("Coherence");
  const [displacement] = buttonsOf("Surface displacement");
  const [moisture, moistureChange, , moistureMap] = buttonsOf("Soil moisture");
  if (
    !oneDate ||
    !change ||
    !series ||
    !onePair ||
    !coherenceChange ||
    !coherenceSeries ||
    !displacement ||
    !moisture ||
    !moistureChange ||
    !moistureMap
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
  const all = [...opened, "coherence-change", "soil-moisture-state", "soil-moisture-change"];
  expect(dockStore.get().tools).toEqual(all);
  await userEvent.click(series);
  await userEvent.click(coherenceSeries);
  await userEvent.click(displacement);
  await userEvent.click(moistureMap);
  expect(dockStore.get().tools).toEqual(all);
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
