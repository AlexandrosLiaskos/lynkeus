import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HOVER_DELAY, Tooltip } from "./Tooltip";

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
const tooltip = () => screen.getByRole("tooltip", { hidden: true });

/** Give the button, its row and the description the places and sizes of a browser, in a window of 1440 by 900. */
function layOut(box: { left: number; top: number; bottom: number }, size: { width: number; height: number }) {
  vi.spyOn(button(), "getBoundingClientRect").mockReturnValue(box as DOMRect);
  const row = button().closest("[data-tooltip-row]");
  if (row) {
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: box.top - 20, bottom: box.bottom + 20 } as DOMRect);
  }
  vi.spyOn(tooltip(), "offsetWidth", "get").mockReturnValue(size.width);
  vi.spyOn(tooltip(), "clientHeight", "get").mockReturnValue(size.height);
}

/** Rest the pointer on the button until its description shows. */
function rest() {
  fireEvent.pointerEnter(button());
  act(() => {
    vi.advanceTimersByTime(HOVER_DELAY);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 900);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the description shows after the pointer has rested on the button, and hides when the pointer leaves", () => {
  render(<Described />);
  expect(tooltip().hidden).toBe(true);
  fireEvent.pointerEnter(button());
  act(() => {
    vi.advanceTimersByTime(HOVER_DELAY - 1);
  });
  expect(tooltip().hidden).toBe(true);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(tooltip().hidden).toBe(false);
  expect(tooltip().textContent).toBe("Zoom inShows the map at twice the scale.");
  expect(document.getElementById(button().getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Shows the map at twice the scale.",
  );
  fireEvent.pointerLeave(button());
  expect(tooltip().hidden).toBe(true);
});

test("the description shows when the keyboard brings the focus, and the Escape key hides it", async () => {
  vi.useRealTimers();
  render(<Described />);
  await userEvent.tab();
  expect(document.activeElement).toBe(button());
  expect(tooltip().hidden).toBe(false);
  await userEvent.keyboard("{Escape}");
  expect(tooltip().hidden).toBe(true);
});

test("the description stands under its button, with a clear strip of 4 pixels between the two", () => {
  render(<Described />);
  layOut({ left: 200, top: 100, bottom: 124 }, { width: 180, height: 60 });
  rest();
  expect(tooltip().style.left).toBe("200px");
  expect(tooltip().style.top).toBe("124px");
  expect(tooltip().style.borderTopWidth).toBe("4px");
  expect(tooltip().style.borderBottomWidth).toBe("0px");
});

test("the description stands above a button at the lower edge of the window, with the strip under it", () => {
  render(<Described />);
  layOut({ left: 200, top: 870, bottom: 894 }, { width: 180, height: 60 });
  rest();
  // Its lower edge, with the strip, meets the upper edge of the button: 870 - 4 - 60.
  expect(tooltip().style.top).toBe("806px");
  expect(tooltip().style.borderTopWidth).toBe("0px");
  expect(tooltip().style.borderBottomWidth).toBe("4px");
});

test("the description stays under a button near the lower edge while it still has room there", () => {
  render(<Described />);
  // 824 + 4 + 60 + 8 = 896, inside a window 900 pixels high.
  layOut({ left: 200, top: 800, bottom: 824 }, { width: 180, height: 60 });
  rest();
  expect(tooltip().style.top).toBe("824px");
  expect(tooltip().style.borderTopWidth).toBe("4px");
});

test("the description stays under a button that has no room above either", () => {
  vi.stubGlobal("innerHeight", 100);
  render(<Described />);
  layOut({ left: 200, top: 40, bottom: 64 }, { width: 180, height: 60 });
  rest();
  expect(tooltip().style.top).toBe("64px");
});

test("the description moves to the left at the right edge of the window", () => {
  render(<Described />);
  layOut({ left: 1400, top: 100, bottom: 124 }, { width: 180, height: 60 });
  rest();
  // It leaves 8 pixels to the edge: 1440 - 180 - 8.
  expect(tooltip().style.left).toBe("1252px");
});

test("in a row the strip reaches over the row, under the button and above it", () => {
  render(<Described row />);
  layOut({ left: 200, top: 100, bottom: 124 }, { width: 180, height: 60 });
  rest();
  expect(tooltip().style.top).toBe("124px");
  expect(tooltip().style.borderTopWidth).toBe("24px");
  fireEvent.pointerLeave(button());
  layOut({ left: 200, top: 850, bottom: 874 }, { width: 180, height: 60 });
  rest();
  // The row begins 20 pixels above the button: 850 - 20 - 4 - 60.
  expect(tooltip().style.top).toBe("766px");
  expect(tooltip().style.borderBottomWidth).toBe("24px");
});
