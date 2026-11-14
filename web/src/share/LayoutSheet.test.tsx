import { act, render } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { FIRST_LAYOUT_FORM } from "./layout";
import { LayoutSheet } from "./LayoutSheet";
import type { Picture } from "./picture";
import { sheetStore, type Sheet } from "./sheet";

const PICTURE: Picture = {
  canvas: document.createElement("canvas"),
  view: { projection: "EPSG:3857", center: [0, 0], resolution: 100, rotation: 0, size: [1000, 600] },
  credits: [],
};

const SHEET: Sheet = {
  form: { ...FIRST_LAYOUT_FORM, title: "Lower Merrimack River" },
  picture: PICTURE,
  ticks: [
    { side: "top", at: 0.25, label: "71\u00b000\u2032W" },
    { side: "bottom", at: 0.25, label: "71\u00b000\u2032W" },
    { side: "left", at: 0.5, label: "42\u00b045\u2032N" },
  ],
  facts: ["Scale 1:250,000 at latitude 42.8\u00b0 N", "Projection: WGS 84 / Pseudo-Mercator (EPSG:3857)"],
  credits: ["\u00a9 OpenStreetMap contributors, openstreetmap.org/copyright"],
};

beforeEach(() => {
  sheetStore.set(null);
});

function sheet(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(":scope > .share-sheet");
}

test("no page is in the document while nothing is printed", () => {
  render(<LayoutSheet />);
  expect(sheet()).toBeNull();
});

test("the page is a child of the body, hidden from assistive technology, with the class of its paper", () => {
  render(<LayoutSheet />);
  act(() => sheetStore.set(SHEET));
  expect(sheet()?.className).toBe("share-sheet share-sheet--a4-landscape");
  expect(sheet()?.getAttribute("aria-hidden")).toBe("true");
  act(() => sheetStore.set({ ...SHEET, form: { ...SHEET.form, paper: "A3", orientation: "portrait" } }));
  expect(sheet()?.className).toBe("share-sheet share-sheet--a3-portrait");
  act(() => sheetStore.set(null));
  expect(sheet()).toBeNull();
});

test("the page holds the title, the picture of the map, the facts and the sources", () => {
  render(<LayoutSheet />);
  act(() => sheetStore.set(SHEET));
  expect(sheet()?.querySelector("h1")?.textContent).toBe("Lower Merrimack River");
  expect(sheet()?.querySelector(".share-sheet-map")?.firstElementChild).toBe(PICTURE.canvas);
  expect([...(sheet()?.querySelectorAll(".share-sheet-facts li") ?? [])].map((item) => item.textContent)).toEqual(
    SHEET.facts,
  );
  expect([...(sheet()?.querySelectorAll(".share-sheet-sources li") ?? [])].map((item) => item.textContent)).toEqual(
    SHEET.credits,
  );
});

test("each mark of the coordinate frame stands on its side, at its place along the side", () => {
  render(<LayoutSheet />);
  act(() => sheetStore.set(SHEET));
  const marks = (side: string) =>
    [...(sheet()?.querySelectorAll<HTMLElement>(`.share-sheet-ticks--${side} .share-sheet-tick`) ?? [])].map((mark) => [
      mark.textContent,
      mark.style.left,
      mark.style.top,
    ]);
  expect(marks("top")).toEqual([["71\u00b000\u2032W", "25%", ""]]);
  expect(marks("bottom")).toEqual([["71\u00b000\u2032W", "25%", ""]]);
  expect(marks("left")).toEqual([["42\u00b045\u2032N", "", "50%"]]);
  expect(marks("right")).toEqual([]);
});

test("a page without a title has no heading, and one without a coordinate frame has no marks", () => {
  render(<LayoutSheet />);
  act(() => sheetStore.set({ ...SHEET, form: { ...SHEET.form, title: "  ", frame: false } }));
  expect(sheet()?.querySelector("h1")).toBeNull();
  expect(sheet()?.querySelector(".share-sheet-ticks")).toBeNull();
  expect(sheet()?.querySelector(".share-sheet-frame")?.className).toBe("share-sheet-frame");
});

test("while the page is measured it holds no picture", () => {
  render(<LayoutSheet />);
  act(() => sheetStore.set({ ...SHEET, picture: null }));
  expect(sheet()?.querySelector(".share-sheet-map")?.childElementCount).toBe(0);
});
