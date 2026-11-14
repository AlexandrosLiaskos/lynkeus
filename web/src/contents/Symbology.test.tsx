import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { displayOf, displayStore, firstDisplay, setDisplay, symbologyStore } from "./state";
import { SymbologyPane } from "./Symbology";

// The pane reads the test files in place of files of the site.
vi.mock("./files", async () => {
  const { openTestFile } = await import("./testdata/files");
  return {
    fileOf: (url: string) => openTestFile(url.includes("coherence") ? "coherence" : "backscatter"),
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

beforeEach(() => {
  resetDock();
  mapLayersStore.set([]);
  displayStore.set({});
  symbologyStore.set(null);
});

test("the pane shows the display of the layer and the histogram of its values", async () => {
  open(COHERENCE);
  expect(screen.getByRole("heading", { name: "Symbology" })).toBeTruthy();
  expect(screen.getByText("Coherence HH, 20 m, 9 Oct 2026 and 21 Oct 2026")).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Colour scale" })).toHaveProperty("value", "grey");
  expect(valueOf("Lowest value")).toBe("0");
  expect(valueOf("Highest value")).toBe("1");
  // The reduced copy of the test file has 64 by 48 cells, and all hold data.
  expect(await screen.findByRole("img", { name: "Histogram of 3072 values, from 0.107 to 0.955" })).toBeTruthy();
  // The statistics that the test file states, written with three significant digits.
  expect(
    screen.getByText(
      /^Statistics that the file states for all its cells: lowest value 0\.0608, highest value 0\.989, mean 0\.537, standard deviation 0\.134\. The histogram and the percent clip use the most reduced copy of the file, of 64 by 48 cells\.$/,
    ),
  ).toBeTruthy();
});

test("a stretch fills the range from the values of the layer, and Apply changes the display", async () => {
  open(COHERENCE);
  await screen.findByRole("img", { name: /^Histogram/ });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Range of the colour scale" }), "Percent clip");
  // The 2nd and the 98th percentile of the reduced copy, as NumPy gives them.
  expect(valueOf("Lowest value")).toBe("0.267394");
  expect(valueOf("Highest value")).toBe("0.745305");
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Range of the colour scale" }),
    "Lowest and highest value",
  );
  expect(valueOf("Lowest value")).toBe("0.0607869");
  expect(valueOf("Highest value")).toBe("0.988722");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Range of the colour scale" }), "Percent clip");
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
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Range of the colour scale" }), "Percent clip");
  fireEvent.change(field("Highest value"), { target: { value: "0.9" } });
  expect(screen.getByRole("combobox", { name: "Range of the colour scale" })).toHaveProperty("value", "typed");
  fireEvent.change(field("Lowest value"), { target: { value: "" } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.getByText("Type a number.")).toBeTruthy();
  expect(field("Lowest value").getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(field("Lowest value"));
  expect(screen.getByRole("alert").textContent).toBe("The display was not changed, because a value is wrong.");
  expect(displayOf(COHERENCE)).toEqual(firstDisplay(COHERENCE));
});

test("the range of a power is typed in decibels, or in the unit of the layer", async () => {
  open(BACKSCATTER);
  expect(valueOf("Lowest value (dB)")).toBe("-20");
  expect(valueOf("Highest value (dB)")).toBe("-3.9794");
  await screen.findByRole("img", { name: /^Histogram/ });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Range of the colour scale" }), "Percent clip");
  // The 2nd and the 98th percentile of the decibels of the reduced copy, as NumPy gives them.
  expect(valueOf("Lowest value (dB)")).toBe("-11.3833");
  expect(valueOf("Highest value (dB)")).toBe("-0.529363");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Range of the colour scale" }), "Typed values");
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
  await userEvent.click(screen.getByRole("checkbox", { name: "Draw the cells without data in a colour" }));
  fireEvent.change(screen.getByLabelText("Colour"), { target: { value: "#ff8800" } });
  await userEvent.click(screen.getByRole("checkbox", { name: "Hide the cells whose value lies outside a range" }));
  fireEvent.change(field("From"), { target: { value: "0.3" } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(displayOf(COHERENCE)).toMatchObject({ noDataColour: "#ff8800", mask: [0.3, 1] });
});

test("the first display returns with one button", async () => {
  open(COHERENCE);
  change(COHERENCE, { colours: "viridis", range: [0.2, 0.8] });
  await userEvent.click(screen.getByRole("button", { name: "Return to the first display" }));
  expect(displayOf(COHERENCE)).toEqual(firstDisplay(COHERENCE));
  expect(valueOf("Highest value")).toBe("1");
});

test("the pane says so when its layer has left the map", () => {
  open(COHERENCE);
  expect(screen.queryByText(/^The layer is no longer on the map\./)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close the Symbology pane" }));
  act(() => {
    mapLayersStore.set([]);
    openToolPane("symbology");
  });
  expect(screen.getByText(/^The layer is no longer on the map\./)).toBeTruthy();
});
