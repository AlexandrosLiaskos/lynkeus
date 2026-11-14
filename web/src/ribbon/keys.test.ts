import { expect, test } from "vitest";
import { tabAfterKey, tabStop, toolAfterKey } from "./keys";

test("the arrow keys move to the tab beside and pass from the last tab to the first", () => {
  expect(tabAfterKey(0, 6, "ArrowRight")).toBe(1);
  expect(tabAfterKey(5, 6, "ArrowRight")).toBe(0);
  expect(tabAfterKey(3, 6, "ArrowLeft")).toBe(2);
  expect(tabAfterKey(0, 6, "ArrowLeft")).toBe(5);
});

test("Home gives the first tab and End the last", () => {
  expect(tabAfterKey(3, 6, "Home")).toBe(0);
  expect(tabAfterKey(3, 6, "End")).toBe(5);
});

test("another key, or a place outside the tabs, does not move the focus between the tabs", () => {
  expect(tabAfterKey(3, 6, "ArrowDown")).toBeUndefined();
  expect(tabAfterKey(3, 6, "a")).toBeUndefined();
  expect(tabAfterKey(-1, 6, "ArrowRight")).toBeUndefined();
  expect(tabAfterKey(0, 0, "Home")).toBeUndefined();
});

// A tab with three groups, of 5, 2 and 3 buttons: the groups start at the places 0, 5 and 7.
const SIZES = [5, 2, 3];

test("the arrow keys move to the button beside, across the groups, and pass from the last button to the first", () => {
  expect(toolAfterKey(0, SIZES, "ArrowRight", false)).toBe(1);
  expect(toolAfterKey(4, SIZES, "ArrowRight", false)).toBe(5);
  expect(toolAfterKey(9, SIZES, "ArrowRight", false)).toBe(0);
  expect(toolAfterKey(5, SIZES, "ArrowLeft", false)).toBe(4);
  expect(toolAfterKey(0, SIZES, "ArrowLeft", false)).toBe(9);
});

test("Home gives the first button and End the last", () => {
  expect(toolAfterKey(6, SIZES, "Home", false)).toBe(0);
  expect(toolAfterKey(6, SIZES, "End", false)).toBe(9);
});

test("the Control key with an arrow key moves to the first button of the group beside", () => {
  expect(toolAfterKey(2, SIZES, "ArrowRight", true)).toBe(5);
  expect(toolAfterKey(6, SIZES, "ArrowRight", true)).toBe(7);
  expect(toolAfterKey(8, SIZES, "ArrowRight", true)).toBe(0);
  expect(toolAfterKey(6, SIZES, "ArrowLeft", true)).toBe(0);
  expect(toolAfterKey(1, SIZES, "ArrowLeft", true)).toBe(7);
  expect(toolAfterKey(1, [3], "ArrowRight", true)).toBe(0);
});

test("another key, or a place outside the buttons, does not move the focus between the buttons", () => {
  expect(toolAfterKey(2, SIZES, "ArrowUp", false)).toBeUndefined();
  expect(toolAfterKey(2, SIZES, "Enter", false)).toBeUndefined();
  expect(toolAfterKey(-1, SIZES, "ArrowRight", false)).toBeUndefined();
  expect(toolAfterKey(10, SIZES, "ArrowLeft", false)).toBeUndefined();
  expect(toolAfterKey(0, [], "Home", false)).toBeUndefined();
});

const TOOLS = [
  { id: "a", finished: false },
  { id: "b", finished: true },
  { id: "c", finished: true },
];

test("the Tab key stops on the button that last had the focus, when the tab shows it", () => {
  expect(tabStop(TOOLS, "c")).toBe("c");
  expect(tabStop(TOOLS, "a")).toBe("a");
});

test("the Tab key stops otherwise on the first finished button, or on the first button when none is finished", () => {
  expect(tabStop(TOOLS, undefined)).toBe("b");
  expect(tabStop(TOOLS, "of-another-tab")).toBe("b");
  expect(tabStop([{ id: "a", finished: false }], undefined)).toBe("a");
  expect(tabStop([], undefined)).toBeUndefined();
});
