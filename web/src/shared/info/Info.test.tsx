// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { endDescriptions, enterWithPointer, focusWithKeyboard, takePointerOff } from "../tooltip/pointer";
import { LEAVE_DELAY } from "../tooltip/Tooltip";
import { Info } from "./Info";

const TEXT = "The width of the buffer in metres, for example 250.";

/** A field with its title and the explanation of the title, as a form declares them. */
function Field({ onKeyDown = vi.fn() }: { onKeyDown?: () => void }) {
  return (
    <div onKeyDown={onKeyDown}>
      <div className="info-title">
        <label className="usa-label" htmlFor="distance">
          Distance
        </label>
        <Info id="distance-info" about="Distance">
          {TEXT}
        </Info>
      </div>
      <input className="usa-input" id="distance" aria-describedby="distance-info" />
      <button type="button">Other</button>
    </div>
  );
}

const button = () => screen.getByRole("button", { name: "Information about Distance" });
const bubble = () => screen.queryByRole("tooltip");
const shown = () => screen.getByRole("tooltip");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  endDescriptions();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("the button is named after its title and described by the explanation", () => {
  render(<Field />);
  expect(button().getAttribute("aria-describedby")).toBe("distance-info");
  expect(document.getElementById("distance-info")?.textContent).toBe(TEXT);
  expect(bubble()).toBeNull();
});

test("the field is described by the explanation also while the bubble is not shown", () => {
  render(<Field />);
  const field = screen.getByRole("textbox", { name: "Distance" });
  const described = document.getElementById(field.getAttribute("aria-describedby") ?? "");
  expect(bubble()).toBeNull();
  expect(described?.textContent).toBe(TEXT);
});

test("the name of the field is its title alone, because the button stands outside the label", () => {
  render(<Field />);
  expect(screen.getByLabelText("Distance")).toBe(screen.getByRole("textbox"));
  expect(screen.getByText("Distance").contains(button())).toBe(false);
});

test("the bubble shows as soon as the pointer is on the button, and hides after the pointer has left", () => {
  render(<Field />);
  enterWithPointer(button());
  expect(shown().textContent).toBe(TEXT);
  expect(button().classList.contains("info-button--open")).toBe(true);
  // The bubble stays for the time in which the pointer can cross onto it.
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  expect(bubble()).not.toBeNull();
  act(() => {
    vi.advanceTimersByTime(LEAVE_DELAY);
  });
  expect(bubble()).toBeNull();
  expect(button().classList.contains("info-button--open")).toBe(false);
});

test("the pointer can move from the button onto the bubble without hiding it", () => {
  render(<Field />);
  enterWithPointer(button());
  fireEvent.pointerLeave(button(), { pointerType: "mouse" });
  fireEvent.pointerEnter(shown(), { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(2 * LEAVE_DELAY);
  });
  expect(bubble()).not.toBeNull();
  takePointerOff(shown());
  expect(bubble()).toBeNull();
});

test("the bubble shows when the keyboard brings the focus to the button and hides when the focus leaves", () => {
  render(<Field />);
  focusWithKeyboard(button());
  expect(document.activeElement).toBe(button());
  expect(bubble()).not.toBeNull();
  act(() => screen.getByRole("textbox").focus());
  expect(bubble()).toBeNull();
});

test("a finger does not show the bubble by touching the button, and shows it by pressing the button", () => {
  render(<Field />);
  fireEvent.pointerEnter(button(), { pointerType: "touch" });
  expect(bubble()).toBeNull();
  fireEvent.click(button());
  expect(bubble()).not.toBeNull();
  // A second press leaves the bubble shown.
  fireEvent.pointerDown(button(), { pointerType: "touch" });
  fireEvent.click(button());
  expect(bubble()).not.toBeNull();
});

test("a press on the button does not hide the bubble that the pointer has shown", () => {
  render(<Field />);
  enterWithPointer(button());
  fireEvent.pointerDown(button(), { pointerType: "mouse" });
  fireEvent.click(button());
  expect(bubble()).not.toBeNull();
});

test("the bubble that a press has shown hides when the focus leaves the button", () => {
  render(<Field />);
  fireEvent.pointerDown(button(), { pointerType: "touch" });
  act(() => button().focus());
  fireEvent.click(button());
  expect(bubble()).not.toBeNull();
  act(() => screen.getByRole("textbox").focus());
  expect(bubble()).toBeNull();
});

test("the Escape key hides the bubble and reaches nothing else", () => {
  const onKeyDown = vi.fn();
  render(<Field onKeyDown={onKeyDown} />);
  focusWithKeyboard(button());
  expect(bubble()).not.toBeNull();
  fireEvent.keyDown(button(), { key: "Escape" });
  expect(onKeyDown).not.toHaveBeenCalled();
  // The focus has not moved, and the bubble stays hidden until the focus comes again.
  expect(document.activeElement).toBe(button());
  expect(bubble()).toBeNull();
});

test("the Escape key hides a bubble that the pointer has shown while the keyboard focus is elsewhere", () => {
  render(<Field />);
  act(() => screen.getByRole("textbox").focus());
  enterWithPointer(button());
  expect(bubble()).not.toBeNull();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(bubble()).toBeNull();
});

test("the Escape key is left to the page while no bubble is shown, and another key always is", () => {
  const onKeyDown = vi.fn();
  render(<Field onKeyDown={onKeyDown} />);
  act(() => screen.getByRole("textbox").focus());
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
  enterWithPointer(button());
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "a" });
  expect(onKeyDown).toHaveBeenCalledTimes(2);
  expect(bubble()).not.toBeNull();
});

test("the bubble is drawn in a layer beside its button, so that it shows over a dialog that holds the button", () => {
  render(
    <dialog open>
      <Field />
    </dialog>,
  );
  enterWithPointer(button());
  expect(button().parentElement?.querySelector(".bubble-layer")?.contains(shown())).toBe(true);
  expect(document.querySelector("dialog")?.contains(shown())).toBe(true);
});

// The page of the test gives every element the place 0, so the button ends at 0.
test("the bubble stands 4 pixels under its button", () => {
  render(<Field />);
  enterWithPointer(button());
  expect(shown().style.top).toBe("4px");
});
