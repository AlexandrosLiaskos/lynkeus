// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { displayOf, displayStore, firstDisplay, setDisplay, symbologyStore } from "./state";
import { SymbologyPane } from "./Symbology";

// The pane reads the test files in place of files of the site.
vi.mock("./files", async () => {
  const { openTestFile } = await import("./testdata/files");
  return {
    fileOf: (url: string) =>
      url.includes("missing")
        ? Promise.reject(new Error("404"))
        : openTestFile(url.includes("coherence") ? "coherence" : "backscatter"),
    forgetFile: () => undefined,
  };
});

const COHERENCE: LayerDescription = {
  id: "coherence",
  title: "Coherence HH, 20 m",
  kind: "layer",
  url: "/files/coherence/coherence.tif",
  quantity: "Interferometric coherence magnitude, HH",
  unit: "1",
  range: [0, 1],
  colours: "grey",
  dates: ["2026-10-09", "2026-10-21"],
  inputs: ["NISAR_L2_PR_GUNW"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/coherence/coherence.json",
};

const BACKSCATTER: LayerDescription = {
  ...COHERENCE,
  id: "backscatter",
  title: "Backscatter HH",
  url: "/files/backscatter/backscatter.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  range: [0.01, 0.4],
  dates: ["2026-10-21"],
};

function open(layer: LayerDescription) {
  addToMap(layer);
  symbologyStore.set({ id: layer.id, time: 1 });
  openToolPane("symbology");
  render(<SymbologyPane />);
}

/** Change the display of a layer while the pane is drawn. */
function change(layer: LayerDescription, display: Parameters<typeof setDisplay>[1]) {
  act(() => {
    setDisplay(layer, display);
  });
}

const field = (name: string | RegExp) => screen.getByRole("textbox", { name });
const valueOf = (name: string | RegExp) => (field(name) as HTMLInputElement).value;
const method = () => screen.getByRole("combobox", { name: "Method" });
const group = (name: string) => screen.getByRole("button", { name });

/** The value that the list of statistics shows beside a name. */
function statistic(name: string): string | null | undefined {
  const list = document.querySelector<HTMLElement>(".property-list");
  return list ? within(list).getByText(name).closest("dt")?.nextElementSibling?.firstElementChild?.textContent : null;
}

/** The text that describes an element: the explanation of its title, and the sentence about its wrong value. */
function descriptionOf(element: HTMLElement): string {
  const ids = element.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

beforeEach(() => {
  resetDock();
  resetPanes();
  mapLayersStore.set([]);
  displayStore.set({});
  symbologyStore.set(null);
});

test("the pane shows the display of the layer and the histogram of its values", async () => {
  open(COHERENCE);
  expect(screen.getByRole("heading", { name: "Symbology" })).toBeTruthy();
  expect(screen.getByText("Coherence HH, 20 m").className).toBe("item-title");
  expect(screen.getByText("9 Oct 2026 and 21 Oct 2026").className).toBe("item-line");
  expect(screen.getByRole("combobox", { name: "Colour scale" })).toHaveProperty("value", "grey");
  expect(valueOf("Lowest value")).toBe("0");
  expect(valueOf("Highest value")).toBe("1");
  // The reduced copy of the test file has 64 by 48 cells, and all hold data.
  expect(await screen.findByRole("img", { name: "Histogram of 3072 values, from 0.107 to 0.955" })).toBeTruthy();
  // The statistics that the test file states, written with three significant digits.
  expect(["Lowest value", "Highest value", "Mean", "Standard deviation"].map(statistic)).toEqual([
    "0.0608",
    "0.989",
    "0.537",
    "0.134",
  ]);
  // Where the statistics come from stands behind the "i" of the group.
  expect(screen.getByRole("button", { name: "Information about Statistics" })).toBeTruthy();
  expect(
    screen.getByText(
      "The file of the layer states these statistics for all its cells. The histogram and the percent clip use the most reduced copy of the file, of 64 by 48 cells. The two lines of the histogram mark the range.",
    ),
  ).toBeTruthy();
});

test("the fields stand in five groups, and the groups that are not in use start closed", () => {
  open(COHERENCE);
  const groups = ["Colours", "Range", "Statistics", "Cells without data", "Mask"];
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(groups);
  expect(groups.map((name) => group(name).getAttribute("aria-expanded"))).toEqual([
    "true",
    "true",
    "true",
    "false",
    "false",
  ]);
});

test("a group that is in use starts open", () => {
  setDisplay(COHERENCE, { noDataColour: "#ff8800", mask: [0.2, 0.8] });
  open(COHERENCE);
  expect(group("Cells without data").getAttribute("aria-expanded")).toBe("true");
  expect(group("Mask").getAttribute("aria-expanded")).toBe("true");
});

test("an explanation stands behind the i of its title and describes its field, and no text stands under a title", async () => {
  open(COHERENCE);
  await screen.findByRole("img", { name: /^Histogram/ });
  expect(document.querySelector(".usa-hint")).toBeNull();
  expect(screen.getByRole("button", { name: "Information about Colour scale" })).toBeTruthy();
  expect(descriptionOf(screen.getByRole("combobox", { name: "Colour scale" }))).toMatch(
    /^The colours that the values of the layer receive/,
  );
  expect(descriptionOf(method())).toMatch(/^The way in which the range is set\./);
  await userEvent.selectOptions(method(), "Percent clip");
  expect(descriptionOf(field("Clip (%)"))).toMatch(/^The percent of the cells that is left out at each end/);
  await userEvent.selectOptions(method(), "Standard deviations");
  expect(descriptionOf(field("Standard deviations"))).toMatch(/^The number of standard deviations on each side/);
  for (const name of ["Symbology", "Range", "Cells without data", "Mask", "Reset display"]) {
    expect(screen.getByRole("button", { name: `Information about ${name}` })).toBeTruthy();
  }
});

test("while the values are read the pane says so in a notice, which leaves when they are read", async () => {
  open(COHERENCE);
  expect(screen.getByRole("status").textContent).toBe("Reading the values of the layer.");
  await screen.findByRole("img", { name: /^Histogram/ });
  expect(screen.queryByText("Reading the values of the layer.")).toBeNull();
});

test("a stretch fills the range from the values of the layer, and Apply changes the display", async () => {
  open(COHERENCE);
  await screen.findByRole("img", { name: /^Histogram/ });
  await userEvent.selectOptions(method(), "Percent clip");
  // The 2nd and the 98th percentile of the reduced copy, as NumPy gives them.
  expect(valueOf("Lowest value")).toBe("0.267394");
  expect(valueOf("Highest value")).toBe("0.745305");
  await userEvent.selectOptions(method(), "Lowest and highest value");
  expect(valueOf("Lowest value")).toBe("0.0607869");
  expect(valueOf("Highest value")).toBe("0.988722");
  await userEvent.selectOptions(method(), "Percent clip");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Colour scale" }), "viridis");
  await userEvent.click(screen.getByRole("checkbox", { name: "Invert the colour scale" }));
  expect(screen.getByRole("img", { name: "Colours of the scale viridis, inverted" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(displayOf(COHERENCE)).toMatchObject({
    colours: "viridis",
    inverted: true,
    range: [0.267394, 0.745305],
    stretch: { kind: "percent", percent: 2 },
  });
  expect(screen.getByRole("status").textContent).toBe("The display of Coherence HH, 20 m was changed.");
});

test("a typed value ends the stretch, and a wrong value is named and changes nothing", async () => {
  open(COHERENCE);
  await screen.findByRole("img", { name: /^Histogram/ });
  await userEvent.selectOptions(method(), "Percent clip");
  fireEvent.change(field("Highest value"), { target: { value: "0.9" } });
  expect(method()).toHaveProperty("value", "typed");
  fireEvent.change(field("Lowest value"), { target: { value: "" } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.getByText("Type a number.")).toBeTruthy();
  expect(field("Lowest value").getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(field("Lowest value"));
  expect(descriptionOf(field("Lowest value"))).toBe("Type a number.");
  expect(screen.getByRole("alert").textContent).toBe(
    "The display was not changed. Correct the value of the marked field.",
  );
  expect(displayOf(COHERENCE)).toEqual(firstDisplay(COHERENCE));
});

test("a wrong value in a closed group opens the group and receives the focus", async () => {
  setDisplay(COHERENCE, { mask: [0.2, 0.8] });
  open(COHERENCE);
  fireEvent.change(field("From"), { target: { value: "" } });
  await userEvent.click(group("Mask"));
  expect(group("Mask").getAttribute("aria-expanded")).toBe("false");
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(group("Mask").getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(field("From"));
  expect(field("From").getAttribute("aria-invalid")).toBe("true");
  expect(displayOf(COHERENCE).mask).toEqual([0.2, 0.8]);
});

test("the pane has one filled button, and the other command is a link", () => {
  open(COHERENCE);
  const filled = [...document.querySelectorAll(".usa-button:not(.usa-button--unstyled, .usa-button--outline)")];
  expect(filled.map((button) => button.textContent)).toEqual(["Apply"]);
  expect(screen.getByRole("button", { name: "Reset display" }).className).toContain("usa-button--unstyled");
});

test("when the values cannot be read, a notice says so and the range is still typed", async () => {
  open({ ...COHERENCE, url: "/files/missing/missing.tif" });
  expect((await screen.findByText(/^The values of the layer could not be read\./)).textContent).toBe(
    "The values of the layer could not be read. Type the lowest and the highest value of the range.",
  );
  expect(screen.queryByRole("img", { name: /^Histogram/ })).toBeNull();
  const options = within(method()).getAllByRole<HTMLOptionElement>("option");
  expect(options.filter((option) => !option.disabled).map((option) => option.textContent)).toEqual(["Typed values"]);
  fireEvent.change(field("Highest value"), { target: { value: "0.8" } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(displayOf({ ...COHERENCE, url: "/files/missing/missing.tif" }).range).toEqual([0, 0.8]);
});

test("the range of a power is typed in decibels, or in the unit of the layer", async () => {
  open(BACKSCATTER);
  expect(valueOf("Lowest value (dB)")).toBe("-20");
  expect(valueOf("Highest value (dB)")).toBe("-3.9794");
  await screen.findByRole("img", { name: /^Histogram/ });
  await userEvent.selectOptions(method(), "Percent clip");
  // The 2nd and the 98th percentile of the decibels of the reduced copy, as NumPy gives them.
  expect(valueOf("Lowest value (dB)")).toBe("-11.3833");
  expect(valueOf("Highest value (dB)")).toBe("-0.529363");
  await userEvent.selectOptions(method(), "Typed values");
  fireEvent.change(field("Lowest value (dB)"), { target: { value: "-20" } });
  fireEvent.change(field("Highest value (dB)"), { target: { value: "0" } });
  await userEvent.click(screen.getByRole("checkbox", { name: "Show in decibels" }));
  expect(valueOf("Lowest value")).toBe("0.01");
  expect(valueOf("Highest value")).toBe("1");
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(displayOf(BACKSCATTER)).toMatchObject({ decibels: false, range: [0.01, 1] });
});

test("the colour of the cells without data and the mask are set in their groups", async () => {
  open(COHERENCE);
  await userEvent.click(group("Cells without data"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Draw in a colour" }));
  fireEvent.change(screen.getByLabelText("Colour"), { target: { value: "#ff8800" } });
  await userEvent.click(group("Mask"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Hide values outside limits" }));
  fireEvent.change(field("From"), { target: { value: "0.3" } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(displayOf(COHERENCE)).toMatchObject({ noDataColour: "#ff8800", mask: [0.3, 1] });
});

test("the first display returns with one button", async () => {
  open(COHERENCE);
  change(COHERENCE, { colours: "viridis", range: [0.2, 0.8] });
  await userEvent.click(screen.getByRole("button", { name: "Reset display" }));
  expect(displayOf(COHERENCE)).toEqual(firstDisplay(COHERENCE));
  expect(valueOf("Highest value")).toBe("1");
  expect(screen.getByText("Coherence HH, 20 m has its first display again.")).toBeTruthy();
});

test("the pane says so when its layer has left the map, and its foot states how it opens for another layer", async () => {
  open(COHERENCE);
  expect(screen.queryByText("The layer of this pane is no longer on the map.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close the Symbology pane" }));
  act(() => {
    mapLayersStore.set([]);
    openToolPane("symbology");
  });
  expect(screen.getByText("No layer")).toBeTruthy();
  expect(screen.getByText("The layer of this pane is no longer on the map.")).toBeTruthy();
  const apply = screen.getByRole("button", { name: "Apply" });
  expect(apply.getAttribute("aria-disabled")).toBe("true");
  expect(descriptionOf(apply)).toBe("Choose Symbology in the menu of a layer.");
  act(() => {
    setPaneOpen("contents", false);
  });
  await userEvent.click(screen.getByRole("button", { name: "Show Contents pane" }));
  expect(panesStore.get().contents.open).toBe(true);
});
