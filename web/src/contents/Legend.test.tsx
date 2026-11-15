import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { colourScale } from "./colours";
import { Legend } from "./Legend";
import { displayStore, setDisplay } from "./state";

const MOISTURE: LayerDescription = {
  id: "moisture",
  title: "Soil moisture",
  kind: "layer",
  url: "/files/moisture/moisture.tif",
  quantity: "Soil moisture",
  unit: "m3 m-3",
  range: [0.05, 0.45],
  colours: "YlGnBu",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L3_PR_SME2"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/moisture/moisture.json",
};

const COMPONENTS: LayerDescription = {
  ...MOISTURE,
  id: "components",
  quantity: "Connected component of the phase unwrapping, HH",
  unit: "1",
  range: [0, 3],
  colours: "tab10",
};

const CHANGE: LayerDescription = {
  ...MOISTURE,
  id: "change",
  kind: "result",
  quantity: "Change of radar backscatter gamma0",
  unit: "dB",
  range: [-7.17, 7.17],
  colours: "RdBu",
  layer: null,
  ends: ["decrease", "increase"],
  method: "Reference of the method",
};

beforeEach(() => {
  displayStore.set({});
});

test("the legend names the quantity and its unit, and marks the ends of the scale and round values between them", () => {
  const { container } = render(<Legend layer={MOISTURE} />);
  expect(screen.getByText("Soil moisture (m\u00b3 m\u207b\u00b3)")).toBeTruthy();
  const ramp = screen.getByRole("img", { name: "Colour scale YlGnBu, from 0.05 to 0.45 m\u00b3 m\u207b\u00b3" });
  expect(ramp.style.background).toContain("linear-gradient(to top, #ffffd9,");
  const marks = [...container.querySelectorAll<HTMLElement>(".legend-marks li")];
  expect(marks.map((mark) => mark.textContent)).toEqual(["0.05", "0.1", "0.2", "0.3", "0.4", "0.45"]);
  expect(marks[0]?.style.bottom).toBe("0%");
  expect(parseFloat(marks[2]?.style.bottom ?? "")).toBeCloseTo(37.5, 9);
  expect(marks.at(-1)?.style.bottom).toBe("100%");
});

test("a quantity without dimension is written without a unit", () => {
  render(<Legend layer={{ ...MOISTURE, quantity: "Interferometric coherence magnitude, HH", unit: "1" }} />);
  expect(screen.getByText("Interferometric coherence magnitude, HH")).toBeTruthy();
});

test("the legend follows the display of the layer", () => {
  setDisplay(MOISTURE, { range: [0, 1], colours: "viridis" });
  render(<Legend layer={MOISTURE} />);
  const ramp = screen.getByRole("img", { name: "Colour scale viridis, from 0 to 1 m\u00b3 m\u207b\u00b3" });
  expect(ramp.style.background).toContain("#440154");
});

test("a power is shown in decibels, and the legend says so", () => {
  const backscatter: LayerDescription = {
    ...MOISTURE,
    id: "backscatter",
    quantity: "Radar backscatter gamma nought, HH, linear power",
    unit: "1",
    range: [0.01, 0.4],
    colours: "grey",
  };
  const { container, unmount } = render(<Legend layer={backscatter} />);
  expect(screen.getByText("Radar backscatter gamma nought, HH, linear power")).toBeTruthy();
  expect(screen.getByText("Shown in decibels (dB).")).toBeTruthy();
  // Ten times the logarithm of 0.01 is -20, and of 0.4 it is -3.98.
  expect(screen.getByRole("img", { name: "Colour scale grey, from -20 to -3.98 dB" })).toBeTruthy();
  const marks = [...container.querySelectorAll(".legend-marks li")].map((mark) => mark.textContent);
  expect(marks).toEqual(["-20", "-15", "-10", "-3.98"]);
  unmount();

  setDisplay(backscatter, { decibels: false });
  render(<Legend layer={backscatter} />);
  expect(screen.queryByText("Shown in decibels (dB).")).toBeNull();
  expect(screen.getByRole("img", { name: "Colour scale grey, from 0.01 to 0.4" })).toBeTruthy();
});

test("the legend shows an inverted scale, the colour of the cells without data and the mask", () => {
  setDisplay(MOISTURE, { inverted: true, noDataColour: "#ff8800", mask: [0.1, 0.4] });
  const { container } = render(<Legend layer={MOISTURE} />);
  const ramp = screen.getByRole("img", { name: /^Colour scale YlGnBu, inverted, from 0.05 to 0.45/ });
  expect(ramp.style.background).toContain("linear-gradient(to top, #081d58,");
  expect(screen.getByText("No data")).toBeTruthy();
  expect(container.querySelector<HTMLElement>(".legend-nodata .legend-swatch")?.style.background).toBe("#ff8800");
  expect(
    screen.getByText("Values below 0.1 m\u00b3 m\u207b\u00b3 and above 0.4 m\u00b3 m\u207b\u00b3 are hidden."),
  ).toBeTruthy();
});

test("a scale of classes lists each whole number of the range beside its colour", () => {
  const { container } = render(<Legend layer={COMPONENTS} />);
  const classes = [...container.querySelectorAll("li")];
  expect(classes.map((item) => item.textContent)).toEqual(["0", "1", "2", "3"]);
  const swatches = [...container.querySelectorAll<HTMLElement>(".legend-swatch")];
  expect(swatches.map((swatch) => swatch.style.background)).toEqual(colourScale("tab10").slice(0, 4));
  expect(screen.queryByText("The colours repeat every ten values.")).toBeNull();
});

test("a scale of classes with more than ten values states that the colours repeat", () => {
  const { container } = render(<Legend layer={{ ...COMPONENTS, range: [1, 25] }} />);
  expect(container.querySelectorAll("li")).toHaveLength(10);
  expect(screen.getByText("The colours repeat every ten values.")).toBeTruthy();
});

test("every note of the legend has one style", () => {
  const power: LayerDescription = {
    ...MOISTURE,
    id: "power",
    quantity: "Radar backscatter gamma nought, HH, linear power",
    unit: "1",
    range: [0.01, 0.4],
    colours: "rainbow",
  };
  setDisplay(power, { noDataColour: "#ff8800", mask: [0.02, 0.3] });
  const { container } = render(<Legend layer={power} />);
  const notes = [...container.querySelectorAll(".legend-note")].map((note) => note.textContent);
  expect(notes).toEqual([
    "Shown in decibels (dB).",
    "No data",
    "Values below -17 dB and above -5.23 dB are hidden.",
    "Lynkeus has no colour scale named rainbow. The layer is drawn in greys.",
  ]);
  // Apart from the quantity, the legend has no paragraph of another style.
  expect(container.querySelectorAll("p:not(.legend-note, .legend-quantity)")).toHaveLength(0);
});

test("the note on the classes of a scale has the style of the other notes", () => {
  const { container } = render(<Legend layer={{ ...COMPONENTS, range: [1, 25] }} />);
  expect(container.querySelector(".legend-note")?.textContent).toBe("The colours repeat every ten values.");
});

test("the legend states when the name of the colour scale is not known", () => {
  render(<Legend layer={{ ...MOISTURE, colours: "rainbow" }} />);
  expect(screen.getByRole("img", { name: /^Colour scale grey,/ })).toBeTruthy();
  expect(screen.getByText("Lynkeus has no colour scale named rainbow. The layer is drawn in greys.")).toBeTruthy();
});

test("the legend names its two ends in the words of the description, each beside the value of its end", () => {
  const { container } = render(<Legend layer={CHANGE} />);
  const ramp = screen.getByRole("img", { name: "Colour scale RdBu, from -7.17 (decrease) to 7.17 dB (increase)" });
  expect(ramp.style.background).toContain(`linear-gradient(to top, ${colourScale("RdBu")[0] ?? ""},`);
  const marks = [...container.querySelectorAll<HTMLElement>(".legend-marks li")];
  expect(marks[0]?.textContent).toBe("-7.17 (decrease)");
  expect(marks[0]?.style.bottom).toBe("0%");
  expect(marks.at(-1)?.textContent).toBe("7.17 (increase)");
  expect(marks.at(-1)?.style.bottom).toBe("100%");
  // The values between the two ends carry no word.
  expect(marks.slice(1, -1).map((mark) => mark.textContent)).toEqual(["-5", "0", "5"]);
});

test("an inverted scale turns the colours and keeps each word beside the value of its end", () => {
  setDisplay(CHANGE, { inverted: true });
  const { container } = render(<Legend layer={CHANGE} />);
  const ramp = screen.getByRole("img", {
    name: "Colour scale RdBu, inverted, from -7.17 (decrease) to 7.17 dB (increase)",
  });
  expect(ramp.style.background).toContain(`linear-gradient(to top, ${colourScale("RdBu").at(-1) ?? ""},`);
  const marks = [...container.querySelectorAll<HTMLElement>(".legend-marks li")];
  expect(marks[0]?.textContent).toBe("-7.17 (decrease)");
  expect(marks[0]?.style.bottom).toBe("0%");
  expect(marks.at(-1)?.textContent).toBe("7.17 (increase)");
  expect(marks.at(-1)?.style.bottom).toBe("100%");
});

test("the words of the ends show only while the range is the one of the description", () => {
  setDisplay(CHANGE, { range: [1, 5] });
  const { container } = render(<Legend layer={CHANGE} />);
  expect(screen.getByRole("img", { name: "Colour scale RdBu, from 1 to 5 dB" })).toBeTruthy();
  const marks = [...container.querySelectorAll(".legend-marks li")].map((mark) => mark.textContent);
  expect(marks[0]).toBe("1");
  expect(marks.at(-1)).toBe("5");
  expect(marks.join(" ")).not.toMatch(/decrease|increase/);
});

test("a description without words for the ends, or with null, has a legend of values only", () => {
  const { container, unmount } = render(<Legend layer={{ ...CHANGE, ends: null }} />);
  expect(screen.getByRole("img", { name: "Colour scale RdBu, from -7.17 to 7.17 dB" })).toBeTruthy();
  expect(container.querySelector(".legend-marks li")?.textContent).toBe("-7.17");
  unmount();
  const stored: LayerDescription = { ...CHANGE };
  delete stored.ends;
  render(<Legend layer={stored} />);
  expect(screen.getByRole("img", { name: "Colour scale RdBu, from -7.17 to 7.17 dB" })).toBeTruthy();
});
