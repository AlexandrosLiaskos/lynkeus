// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { endDescriptions, enterWithPointer, focusWithKeyboard, restPointerOn, takePointerOff } from "./pointer";
import { HOVER_DELAY, LEAVE_DELAY, Tooltip } from "./Tooltip";

/** A button with its description, in a row that shows a name under the button, as a group of the ribbon does. */
function Described({ row = false }: { row?: boolean }) {
  return (
    <div data-tooltip-row={row ? "" : undefined}>
      <Tooltip title="Zoom in" text="Shows the map at twice the scale.">
        {(describedBy) => (
          <button type="button" aria-describedby={describedBy}>
            Zoom in
          </button>
        )}
      </Tooltip>
    </div>
  );
}

const button = () => screen.getByRole("button", { name: "Zoom in" });
const tooltip = () => screen.queryByRole("tooltip");
const shown = () => screen.getByRole("tooltip");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  endDescriptions();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("the description shows after the pointer has rested on the button, and hides after the pointer has left", () => {
  render(<Described />);
  expect(tooltip()).toBeNull();
  enterWithPointer(button());
  act(() => {
    vi.advanceTimersByTime(HOVER_DELAY - 1);
  });
  expect(tooltip()).toBeNull();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(shown().textContent).toBe("Zoom inShows the map at twice the scale.");
  // The description stays for the time in which the pointer can cross onto it.
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(LEAVE_DELAY - 1);
  });
  expect(tooltip()).not.toBeNull();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(tooltip()).toBeNull();
});

test("the description stays while the pointer is on it", () => {
  render(<Described />);
  restPointerOn(button());
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  fireEvent.pointerEnter(shown(), { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(2 * LEAVE_DELAY);
  });
  expect(tooltip()).not.toBeNull();
  takePointerOff(shown());
  expect(tooltip()).toBeNull();
});

test("the sentences are in the page while the description is not shown, and the button is described by them", () => {
  render(<Described />);
  const sentences = document.getElementById(button().getAttribute("aria-describedby") ?? "");
  expect(sentences?.textContent).toBe("Shows the map at twice the scale.");
  expect(sentences?.hidden).toBe(true);
  expect(tooltip()).toBeNull();
  restPointerOn(button());
  expect(document.getElementById(button().getAttribute("aria-describedby") ?? "")).toBe(sentences);
});

test("a button whose name says it all has no description, and its name stands alone in its tooltip", () => {
  render(<Tooltip title="More">{() => <button type="button" aria-label="More" />}</Tooltip>);
  const more = screen.getByRole("button", { name: "More" });
  expect(more.hasAttribute("aria-describedby")).toBe(false);
  restPointerOn(more);
  expect(shown().textContent).toBe("More");
  expect(shown().children).toHaveLength(1);
});

test("a second sentence follows the first one, in the description and in what describes the button", () => {
  render(
    <Tooltip title="Clear all" text="Removes everything." note="Nothing is stored.">
      {(describedBy) => (
        <button type="button" aria-disabled aria-describedby={describedBy}>
          Clear all
        </button>
      )}
    </Tooltip>,
  );
  const clear = screen.getByRole("button", { name: "Clear all" });
  expect(document.getElementById(clear.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Removes everything. Nothing is stored.",
  );
  restPointerOn(clear);
  expect(shown().textContent).toBe("Clear allRemoves everything. Nothing is stored.");
});

test("the description shows when the keyboard brings the focus, and the Escape key hides it", () => {
  render(<Described />);
  focusWithKeyboard(button());
  expect(document.activeElement).toBe(button());
  expect(tooltip()).not.toBeNull();
  fireEvent.keyDown(button(), { key: "Escape" });
  expect(tooltip()).toBeNull();
  expect(document.activeElement).toBe(button());
});

test("the Escape key reaches nothing else while a description shows, and reaches the page while none shows", () => {
  const onKeyDown = vi.fn();
  render(
    <div onKeyDown={onKeyDown}>
      <Described />
    </div>,
  );
  focusWithKeyboard(button());
  expect(tooltip()).not.toBeNull();
  fireEvent.keyDown(button(), { key: "Escape" });
  expect(onKeyDown).not.toHaveBeenCalled();
  fireEvent.keyDown(button(), { key: "Escape" });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

test("the description does not show when a press brings the focus", () => {
  render(<Described />);
  fireEvent.pointerDown(button(), { pointerType: "mouse" });
  act(() => button().focus());
  act(() => {
    vi.advanceTimersByTime(2 * HOVER_DELAY);
  });
  expect(document.activeElement).toBe(button());
  expect(tooltip()).toBeNull();
});

test("a press on the button hides its description", () => {
  render(<Described />);
  restPointerOn(button());
  expect(tooltip()).not.toBeNull();
  fireEvent.pointerDown(button(), { pointerType: "mouse" });
  expect(tooltip()).toBeNull();
});

test("the description is drawn in a layer beside its button, so that it shows over a dialog that holds the button", () => {
  render(
    <dialog open>
      <Described />
    </dialog>,
  );
  restPointerOn(button());
  expect(button().parentElement?.querySelector(".bubble-layer")?.contains(shown())).toBe(true);
  expect(document.querySelector("dialog")?.contains(shown())).toBe(true);
});

// The page of the test gives every element the place 0, so the button ends at 0.
test("the description stands 4 pixels under its button", () => {
  render(<Described />);
  restPointerOn(button());
  expect(shown().style.top).toBe("4px");
});

test("the description stands 4 pixels under the row of a button that has a row", () => {
  render(<Described row />);
  const row = button().closest("[data-tooltip-row]");
  if (row) {
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ bottom: 20 } as DOMRect);
  }
  restPointerOn(button());
  expect(shown().style.top).toBe("24px");
});
