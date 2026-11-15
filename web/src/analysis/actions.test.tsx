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

test("exactly the buttons of the three finished tools have an action", () => {
  const actions = renderHook(useAnalysisActions).result.current;
  expect(Object.keys(actions)).toEqual(["backscatter-state", "backscatter-change", "coherence-state"]);
  expect(Object.keys(actions)).toEqual([...FINISHED_TOOLS]);
  const declared = ANALYSIS_TAB.groups.flatMap(({ tools }) => tools.map(({ id }) => id));
  expect(declared).toHaveLength(16);
  for (const tool of FINISHED_TOOLS) {
    expect(declared).toContain(tool);
  }
});

test("the three finished buttons are active, and every other button of the tab is inactive", () => {
  render(<AnalysisTab />);
  const inactive = Object.fromEntries(
    ANALYSIS_TAB.groups.map(({ label }) => [
      label,
      buttonsOf(label).map((button) => button.getAttribute("aria-disabled") === "true"),
    ]),
  );
  expect(inactive).toEqual({
    Backscatter: [false, false, true, true],
    Coherence: [false, true, true, true],
    "Surface displacement": [true, true, true, true],
    "Soil moisture": [true, true, true, true],
  });
});

test("the button of a finished tool opens the tool pane of that tool, and an inactive button opens none", async () => {
  render(<AnalysisTab />);
  const [oneDate, change, series] = buttonsOf("Backscatter");
  const [onePair, coherenceChange] = buttonsOf("Coherence");
  if (!oneDate || !change || !series || !onePair || !coherenceChange) {
    throw new Error("The tab does not hold the buttons of its two first groups.");
  }
  await userEvent.click(oneDate);
  expect(dockStore.get().tools).toEqual(["backscatter-state"]);
  await userEvent.click(change);
  expect(dockStore.get().tools).toEqual(["backscatter-state", "backscatter-change"]);
  await userEvent.click(onePair);
  expect(dockStore.get().tools).toEqual(["backscatter-state", "backscatter-change", "coherence-state"]);
  await userEvent.click(series);
  await userEvent.click(coherenceChange);
  expect(dockStore.get().tools).toEqual(["backscatter-state", "backscatter-change", "coherence-state"]);
});
