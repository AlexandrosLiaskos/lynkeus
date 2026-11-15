// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Info } from "./Info";

/** A field with its title and the explanation of the title, as a form declares them. */
function Field({ onKeyDown = vi.fn() }: { onKeyDown?: () => void }) {
  return (
    <div onKeyDown={onKeyDown}>
      <div className="info-title">
        <label className="usa-label" htmlFor="distance">
          Distance
        </label>
        <Info id="distance-info" about="Distance">
          The width of the buffer in metres, for example 250.
        </Info>
      </div>
      <input className="usa-input" id="distance" aria-describedby="distance-info" />
      <button type="button">Other</button>
    </div>
  );
}

const button = () => screen.getByRole("button", { name: "Information about Distance" });
const bubble = () => screen.getByRole("tooltip");
const shown = () => bubble().classList.contains("info-bubble--open");

afterEach(() => {
  vi.restoreAllMocks();
});

test("the button is named after its title and described by the explanation", () => {
  render(<Field />);
  expect(button().getAttribute("aria-describedby")).toBe("distance-info");
  expect(bubble().textContent).toBe("The width of the buffer in metres, for example 250.");
  expect(shown()).toBe(false);
});

test("the field is described by the explanation also while the bubble is not shown", () => {
  render(<Field />);
  const field = screen.getByRole("textbox", { name: "Distance" });
  const described = document.getElementById(field.getAttribute("aria-describedby") ?? "");
  expect(shown()).toBe(false);
  expect(described?.textContent).toBe("The width of the buffer in metres, for example 250.");
});

test("the name of the field is its title alone, because the button stands outside the label", () => {
  render(<Field />);
  expect(screen.getByLabelText("Distance")).toBe(screen.getByRole("textbox"));
  expect(screen.getByText("Distance").contains(button())).toBe(false);
});

test("the bubble shows while the pointer rests on the button and hides when the pointer leaves", () => {
  render(<Field />);
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  expect(shown()).toBe(true);
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  expect(shown()).toBe(false);
});

test("the bubble stands inside the element that the pointer rests on, so the pointer can move onto it", () => {
  render(<Field />);
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  expect(button().parentElement?.contains(bubble())).toBe(true);
  // The pointer goes from the button to the bubble and does not leave the element that holds both.
  fireEvent.pointerOut(button(), { pointerType: "mouse", relatedTarget: bubble() });
  fireEvent.pointerOver(bubble(), { pointerType: "mouse", relatedTarget: button() });
  expect(shown()).toBe(true);
});

test("the bubble shows when the keyboard brings the focus to the button and hides when the focus leaves", async () => {
  render(<Field />);
  await userEvent.tab();
  expect(document.activeElement).toBe(button());
  expect(shown()).toBe(true);
  await userEvent.tab();
  expect(shown()).toBe(false);
});

test("the bubble stays for the keyboard focus after the pointer has passed over the button", async () => {
  render(<Field />);
  await userEvent.tab();
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  expect(shown()).toBe(true);
});

test("a finger does not show the bubble by touching the button, and shows it by pressing the button", () => {
  render(<Field />);
  fireEvent.pointerEnter(button(), { pointerType: "touch" });
  expect(shown()).toBe(false);
  fireEvent.click(button());
  expect(shown()).toBe(true);
  // A second press leaves the bubble shown.
  fireEvent.click(button());
  expect(shown()).toBe(true);
});

test("a press outside the button and its bubble hides the bubble that a press has shown", () => {
  render(<Field />);
  fireEvent.click(button());
  fireEvent.pointerDown(bubble());
  expect(shown()).toBe(true);
  fireEvent.pointerDown(screen.getByRole("textbox"));
  expect(shown()).toBe(false);
});

test("the Escape key hides the bubble and reaches nothing else", async () => {
  const onKeyDown = vi.fn();
  render(<Field onKeyDown={onKeyDown} />);
  await userEvent.tab();
  expect(shown()).toBe(true);
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  fireEvent(button(), escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(onKeyDown).not.toHaveBeenCalled();
  // The focus has not moved, and the bubble stays hidden until the focus comes again.
  expect(document.activeElement).toBe(button());
  expect(shown()).toBe(false);
});

test("the Escape key hides a bubble that the pointer has shown while the keyboard focus is elsewhere", async () => {
  render(<Field />);
  screen.getByRole("textbox").focus();
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  expect(shown()).toBe(true);
  await userEvent.keyboard("{Escape}");
  expect(shown()).toBe(false);
});

test("the Escape key is left to the page while no bubble is shown, and another key always is", async () => {
  const onKeyDown = vi.fn();
  render(<Field onKeyDown={onKeyDown} />);
  screen.getByRole("textbox").focus();
  await userEvent.keyboard("{Escape}");
  expect(onKeyDown).toHaveBeenCalledTimes(1);
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  await userEvent.keyboard("a");
  expect(onKeyDown).toHaveBeenCalledTimes(2);
  expect(shown()).toBe(true);
});

/** Give the button and the bubble the places and sizes that a browser would give them, in a window of 1440 by 900. */
function layOut(buttonBox: { left: number; top: number; bottom: number }, size: { width: number; height: number }) {
  vi.spyOn(button(), "getBoundingClientRect").mockReturnValue(buttonBox as DOMRect);
  vi.spyOn(bubble(), "getBoundingClientRect").mockReturnValue(size as DOMRect);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1440);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(900);
}

test("the bubble is placed under its button, inside the window", () => {
  render(<Field />);
  layOut({ left: 1400, top: 200, bottom: 224 }, { width: 256, height: 80 });
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  expect(bubble().style.left).toBe("1176px");
  expect(bubble().style.top).toBe("224px");
});

test("the bubble is placed above a button that stands at the foot of the window", () => {
  render(<Field />);
  layOut({ left: 1000, top: 850, bottom: 874 }, { width: 256, height: 80 });
  fireEvent.click(button());
  expect(bubble().style.left).toBe("1000px");
  expect(bubble().style.top).toBe("770px");
});

test("the bubble follows its button when the pane scrolls, and has no place while it is not shown", () => {
  render(<Field />);
  layOut({ left: 1200, top: 200, bottom: 224 }, { width: 256, height: 80 });
  fireEvent.pointerEnter(button(), { pointerType: "mouse" });
  vi.spyOn(button(), "getBoundingClientRect").mockReturnValue({ left: 1200, top: 150, bottom: 174 } as DOMRect);
  fireEvent.scroll(document.body);
  expect(bubble().style.top).toBe("174px");
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  expect(bubble().style.top).toBe("");
});
