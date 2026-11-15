// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { HOVER_DELAY, LEAVE_DELAY } from "./Tooltip";

// Steps of the pointer and of the keyboard for the tests of a description. The test that calls a step which lets
// time pass runs under `vi.useFakeTimers`.

/** Bring the keyboard focus to an element, as the Tab key does. */
export function focusWithKeyboard(element: HTMLElement): void {
  // React Aria Components shows a description for a focus that follows a key, and not for one that follows a press.
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => {
    element.focus();
  });
}

/** Bring the pointer onto an element. */
export function enterWithPointer(element: Element): void {
  // The pointer of a user moves over the page before it enters an element, and React Aria Components shows a
  // description only for a pointer that has moved.
  fireEvent.pointerMove(document.body, { pointerType: "mouse" });
  fireEvent.pointerEnter(element, { pointerType: "mouse" });
}

/** Rest the pointer on an element for the time after which its description shows. */
export function restPointerOn(element: Element): void {
  enterWithPointer(element);
  act(() => {
    vi.advanceTimersByTime(HOVER_DELAY);
  });
}

/** Take the pointer off an element, and let the time pass after which its description hides. */
export function takePointerOff(element: Element): void {
  fireEvent.pointerLeave(element, { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(LEAVE_DELAY);
  });
}

/**
 * End a test of a description: hide the description that still shows, and let the half second pass in which the
 * library shows the next description without its delay.
 */
export function endDescriptions(): void {
  fireEvent.keyDown(document.body, { key: "Escape" });
  act(() => {
    vi.advanceTimersByTime(2 * LEAVE_DELAY);
  });
}
