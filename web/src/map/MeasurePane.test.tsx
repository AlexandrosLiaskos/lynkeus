// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { measurementRows, MeasurePane } from "./MeasurePane";
import { measurementsStore, measureUnitsStore, type Measurement } from "./measure";
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

/** Return the section of the pane whose title starts with a name. */
function section(name: string): HTMLElement {
  return screen.getByRole("group", { name: new RegExp(`^${name}`) });
}

/** Return the rows of a section as "name: value". */
function rows(name: string): string[] {
  return [...section(name).querySelectorAll(".property-row")].map(
    (row) =>
      `${row.querySelector("dt span")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
}

test("the rows of a line are its length and its segments, and those of a polygon its area, perimeter and sides", () => {
  const units = { distance: "km", area: "ha" } as const;
  expect(measurementRows(LINE, units)).toEqual([
    { name: "Length", value: "3.346 km", copy: true },
    { name: "Segment 1", value: "1.000 km" },
    { name: "Segment 2", value: "2.346 km" },
  ]);
  expect(measurementRows(POLYGON, units).slice(0, 3)).toEqual([
    { name: "Area", value: "100.00 ha", copy: true },
    { name: "Perimeter", value: "4.000 km", copy: true },
    { name: "Side 1", value: "1.000 km" },
  ]);
});

test("the finished measurements are listed in groups with their segments, in the chosen units", async () => {
  measurementsStore.set([LINE, POLYGON]);
  openPane("measure-area", <MeasurePane kind="area" />);
  expect(screen.getByRole("button", { name: "Measurements (2)" }).getAttribute("aria-expanded")).toBe("true");
  expect(
    within(section("Measurements"))
      .getAllByRole("heading", { level: 4 })
      .map((heading) => heading.textContent),
  ).toEqual(["Distance 1", "Area 2"]);
  expect(rows("Measurements")).toEqual([
    "Length: 3.346 km",
    "Segment 1: 1.000 km",
    "Segment 2: 2.346 km",
    "Area: 1.000 km²",
    "Perimeter: 4.000 km",
    "Side 1: 1.000 km",
    "Side 2: 1.000 km",
    "Side 3: 1.000 km",
    "Side 4: 1.000 km",
  ]);
  await userEvent.selectOptions(screen.getByLabelText("Unit of length"), "Metres (m)");
  await userEvent.selectOptions(screen.getByLabelText("Unit of area"), "Hectares (ha)");
  expect(measureUnitsStore.get()).toEqual({ distance: "m", area: "ha" });
  expect(rows("Measurements").filter((row) => !/^(Segment|Side)/.test(row))).toEqual([
    "Length: 3,345.7 m",
    "Area: 100.00 ha",
    "Perimeter: 4,000.0 m",
  ]);
});

test("a length, an area and a perimeter can be copied, and a segment cannot", () => {
  measurementsStore.set([LINE, POLYGON]);
  openPane("measure-area", <MeasurePane kind="area" />);
  for (const name of ["Copy Length", "Copy Area", "Copy Perimeter"]) {
    expect(screen.getByRole("button", { name })).toBeDefined();
  }
  expect(screen.queryByRole("button", { name: "Copy Segment 1" })).toBeNull();
});

test("the pane of Measure distance offers the unit of length alone, and names the next step while nothing is measured", () => {
  openPane("measure-distance", <MeasurePane kind="distance" />);
  expect(screen.getByLabelText("Unit of length")).toBeDefined();
  expect(screen.queryByLabelText("Unit of area")).toBeNull();
  expect(within(section("Measurements")).getByText("No measurements")).toBeDefined();
  expect(
    within(section("Measurements")).getByText(
      "Click the points of a line on the map, and click twice on the last point.",
    ),
  ).toBeDefined();
});

test("the line that is being drawn has a section of its own above the finished measurements", () => {
  openPane("measure-distance", <MeasurePane kind="distance" />);
  expect(screen.queryByRole("group", { name: "Line being drawn" })).toBeNull();
  act(() => sketchStore.set(LINE));
  expect(rows("Line being drawn")).toEqual(["Length: 3.346 km", "Segment 1: 1.000 km", "Segment 2: 2.346 km"]);
  expect(
    section("Line being drawn").compareDocumentPosition(section("Measurements")) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  act(() => sketchStore.set(POLYGON));
  expect(rows("Polygon being drawn").slice(0, 2)).toEqual(["Area: 1.000 km²", "Perimeter: 4.000 km"]);
});

test("the button Clear measurements empties the list, and says why it is inactive without measurements", async () => {
  openPane("measure-distance", <MeasurePane kind="distance" />);
  const clear = screen.getByRole("button", { name: "Clear measurements" });
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("There is no measurement to clear.");
  act(() => measurementsStore.set([LINE]));
  expect(clear.getAttribute("aria-disabled")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  await userEvent.click(clear);
  expect(measurementsStore.get()).toEqual([]);
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("the pane and its measurements are described by their explanations, which show from the buttons beside the titles", () => {
  openPane("measure-area", <MeasurePane kind="area" />);
  expect(explanation(screen.getByRole("complementary", { name: "Measure area" }))).toMatch(
    /^Click the points of the polygon on the map, .* the Escape key discards the polygon\.$/,
  );
  expect(explanation(section("Measurements"))).toMatch(
    /^The lengths and the areas are measured on a sphere with a radius of 6,371,008\.8 metres, /,
  );
  expect(screen.getByRole("button", { name: "Information about Measure area" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Information about Measurements" })).toBeDefined();
  expect(document.querySelector(".usa-hint")).toBeNull();
});
