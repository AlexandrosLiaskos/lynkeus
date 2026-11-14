import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { measurementsStore, measureUnitsStore, type Measurement } from "./measure";
import { MeasurePane } from "./MeasurePane";
import { sketchStore } from "./measureTool";
import { openPane } from "./testPane";

const LINE: Measurement = { kind: "distance", segments: [1000, 2345.67], length: 3345.67, area: null };
const POLYGON: Measurement = { kind: "area", segments: [1000, 1000, 1000, 1000], length: 4000, area: 1e6 };

beforeEach(() => {
  measurementsStore.set([]);
  measureUnitsStore.set({ distance: "km", area: "km2" });
  sketchStore.set(null);
  resetDock();
});

function results(): string[] {
  return within(screen.getByRole("list", { name: "Finished measurements" }))
    .getAllByRole("listitem")
    .filter((item) => item.classList.contains("measure-result"))
    .map((item) => item.querySelector("strong")?.textContent ?? "");
}

test("the finished measurements are listed with their segments, in the chosen units", async () => {
  measurementsStore.set([LINE, POLYGON]);
  openPane("measure-area", <MeasurePane kind="area" />);
  expect(results()).toEqual(["Distance 1: 3.346 km", "Area 2: 1.000 km², perimeter 4.000 km"]);
  expect(
    within(screen.getByRole("list", { name: "Segments of Distance 1" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["1.000 km", "2.346 km"]);
  await userEvent.selectOptions(screen.getByLabelText("Unit of length"), "Metres (m)");
  await userEvent.selectOptions(screen.getByLabelText("Unit of area"), "Hectares (ha)");
  expect(measureUnitsStore.get()).toEqual({ distance: "m", area: "ha" });
  expect(results()).toEqual(["Distance 1: 3,345.7 m", "Area 2: 100.00 ha, perimeter 4,000.0 m"]);
});

test("the pane of Measure distance offers the unit of length alone", () => {
  openPane("measure-distance", <MeasurePane kind="distance" />);
  expect(screen.getByLabelText("Unit of length")).toBeDefined();
  expect(screen.queryByLabelText("Unit of area")).toBeNull();
  expect(screen.getByText("Nothing is measured.")).toBeDefined();
});

test("the line that is being drawn is shown above the finished measurements", () => {
  openPane("measure-distance", <MeasurePane kind="distance" />);
  act(() => sketchStore.set(LINE));
  expect(screen.getByText("The line being drawn: 3.346 km")).toBeDefined();
});

test("the button Clear results empties the list, and is inactive without results", async () => {
  openPane("measure-distance", <MeasurePane kind="distance" />);
  const clear = screen.getByRole("button", { name: "Clear results" });
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  act(() => measurementsStore.set([LINE]));
  expect(clear.getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(clear);
  expect(measurementsStore.get()).toEqual([]);
});
