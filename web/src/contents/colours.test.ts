import { expect, test } from "vitest";
import { COLOUR_SCALES, DEFAULT_SCALE, colourScale, isColourScale, scaleKind } from "./colours";

/** The share of light that a CSS colour of six hexadecimal digits gives, from 0 to 1, by the weights of Rec. 709. */
function luma(colour: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(colour.slice(start, start + 2), 16) / 255);
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

test("every continuous scale has 256 colours and the scale of classes has ten", () => {
  for (const { name, kind } of COLOUR_SCALES) {
    const colours = colourScale(name);
    expect(colours, name).toHaveLength(kind === "classes" ? 10 : 256);
    expect(
      colours.every((colour) => /^#[0-9a-f]{6}$/.test(colour)),
      name,
    ).toBe(true);
  }
});

test("the grey scale runs from black to white in equal steps", () => {
  const colours = colourScale("grey");
  expect(colours[0]).toBe("#000000");
  expect(colours[128]).toBe("#808080");
  expect(colours[255]).toBe("#ffffff");
});

test("the scales start and end with the colours of their sources", () => {
  // The first and the last colour of each table, as matplotlib 3.11.2, cmcrameri 1.10 and cmocean 4.0.3 give them.
  const ends: Record<string, [string, string]> = {
    viridis: ["#440154", "#fde725"],
    magma: ["#000004", "#fcfdbf"],
    inferno: ["#000004", "#fcffa4"],
    plasma: ["#0d0887", "#f0f921"],
    YlGnBu: ["#ffffd9", "#081d58"],
    RdBu: ["#67001f", "#053061"],
    BrBG: ["#543005", "#003c30"],
    batlow: ["#011959", "#faccfa"],
    vik: ["#001261", "#590008"],
    romaO: ["#733957", "#723959"],
    balance: ["#181c43", "#3c0912"],
    phase: ["#a8780d", "#a8780d"],
    tab10: ["#1f77b4", "#17becf"],
  };
  for (const [name, [first, last]] of Object.entries(ends)) {
    const colours = colourScale(name);
    expect(colours[0], name).toBe(first);
    expect(colours.at(-1), name).toBe(last);
  }
});

test("a diverging scale is lightest near its middle", () => {
  for (const { name, kind } of COLOUR_SCALES) {
    if (kind === "diverging") {
      const lightness = colourScale(name).map(luma);
      const lightest = lightness.indexOf(Math.max(...lightness));
      expect(lightest, name).toBeGreaterThan(112);
      expect(lightest, name).toBeLessThan(144);
    }
  }
});

test("a name that is not known gives the grey scale", () => {
  expect(isColourScale("grey")).toBe(true);
  expect(isColourScale("rainbow")).toBe(false);
  expect(colourScale("rainbow")).toEqual(colourScale(DEFAULT_SCALE));
  expect(scaleKind("rainbow")).toBe("sequential");
});

test("the names that the server gives to layers are known", () => {
  for (const name of ["grey", "YlGnBu", "RdBu", "tab10"]) {
    expect(isColourScale(name), name).toBe(true);
  }
});
