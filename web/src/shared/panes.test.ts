import { beforeEach, expect, test } from "vitest";
import {
  clampWidth,
  PANE_WIDTH,
  panesStore,
  resetPanes,
  setPaneOpen,
  setPaneWidth,
  sideOf,
  widthAfterKey,
  widthHolder,
} from "./panes";

beforeEach(resetPanes);

test("the Contents pane stands on the left and the Catalog pane on the right", () => {
  expect(sideOf("contents")).toBe("left");
  expect(sideOf("catalog")).toBe("right");
});

test("each side takes the width that its first pane holds", () => {
  expect(widthHolder("left")).toBe("contents");
  expect(widthHolder("right")).toBe("catalog");
});

test("a width is brought inside the limits and rounded to whole pixels", () => {
  expect(clampWidth(10)).toBe(PANE_WIDTH.smallest);
  expect(clampWidth(10_000)).toBe(PANE_WIDTH.largest);
  expect(clampWidth(300.4)).toBe(300);
});

test("an arrow key moves the edge of a pane by one step, away from the map or towards it", () => {
  expect(widthAfterKey(288, "ArrowRight", "left")).toBe(304);
  expect(widthAfterKey(288, "ArrowLeft", "left")).toBe(272);
  expect(widthAfterKey(288, "ArrowLeft", "right")).toBe(304);
  expect(widthAfterKey(288, "ArrowRight", "right")).toBe(272);
});

test("Home and End give the smallest and the largest width", () => {
  expect(widthAfterKey(288, "Home", "left")).toBe(PANE_WIDTH.smallest);
  expect(widthAfterKey(288, "End", "right")).toBe(PANE_WIDTH.largest);
});

test("an arrow key does not move the edge past a limit, and another key changes nothing", () => {
  expect(widthAfterKey(PANE_WIDTH.largest, "ArrowRight", "left")).toBe(PANE_WIDTH.largest);
  expect(widthAfterKey(PANE_WIDTH.smallest, "ArrowLeft", "left")).toBe(PANE_WIDTH.smallest);
  expect(widthAfterKey(288, "Enter", "left")).toBeUndefined();
});

test("a pane is closed, resized and returned to its first state", () => {
  setPaneOpen("catalog", false);
  setPaneWidth("contents", 10_000);
  expect(panesStore.get().catalog.open).toBe(false);
  expect(panesStore.get().contents.width).toBe(PANE_WIDTH.largest);
  resetPanes();
  expect(panesStore.get().catalog.open).toBe(true);
  expect(panesStore.get().contents.width).toBe(PANE_WIDTH.first);
});
