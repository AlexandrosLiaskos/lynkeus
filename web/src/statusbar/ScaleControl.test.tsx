// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { messagesStore } from "../shared/messages/messages";
import { ScaleControl } from "./ScaleControl";

beforeEach(() => messagesStore.set([]));

function setUp() {
  const onChoose = vi.fn<(scale: number) => void>();
  render(<ScaleControl scale={25_000} onChoose={onChoose} />);
  const field = screen.getByRole<HTMLInputElement>("combobox", { name: "Scale" });
  return { onChoose, field };
}

test("the field shows the scale of the map and its list is closed", () => {
  const { field } = setUp();
  expect(field.value).toBe("1:25,000");
  expect(field.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("a typed scale is chosen with the Enter key", async () => {
  const { onChoose, field } = setUp();
  await userEvent.clear(field);
  await userEvent.type(field, "1:50,000{Enter}");
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(50_000);
  expect(field.value).toBe("1:25,000");
});

test("a text that is not a scale is refused with a message, and the field shows the scale of the map again", async () => {
  const { onChoose, field } = setUp();
  await userEvent.clear(field);
  await userEvent.type(field, "abc{Enter}");
  expect(onChoose).not.toHaveBeenCalled();
  expect(field.value).toBe("1:25,000");
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["error", '"abc" is not a scale. Write a scale as 1:25,000 or as 25000.'],
  ]);
});

test("the Enter key on a field that was not changed chooses nothing", async () => {
  const { onChoose, field } = setUp();
  field.focus();
  await userEvent.keyboard("{Enter}");
  expect(onChoose).not.toHaveBeenCalled();
});

test("the down arrow opens the list at its first scale, and the Enter key chooses the scale reached", async () => {
  const { onChoose, field } = setUp();
  field.focus();
  await userEvent.keyboard("{ArrowDown}");
  const options = within(screen.getByRole("listbox", { name: "Scales" })).getAllByRole("option");
  expect(options.length).toBe(17);
  expect(field.getAttribute("aria-expanded")).toBe("true");
  expect(field.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
  expect(options[0]?.textContent).toBe("1:100,000,000");
  expect(options[0]?.getAttribute("aria-selected")).toBe("true");
  await userEvent.keyboard("{ArrowDown}{ArrowDown}");
  expect(field.getAttribute("aria-activedescendant")).toBe(options[2]?.id);
  await userEvent.keyboard("{Enter}");
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(25_000_000);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(field);
});

test("the up arrow opens the list at its last scale and passes from the first scale to the last", async () => {
  const { onChoose, field } = setUp();
  field.focus();
  await userEvent.keyboard("{ArrowUp}{Enter}");
  expect(onChoose).toHaveBeenLastCalledWith(500);
  await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
  expect(onChoose).toHaveBeenLastCalledWith(500);
});

test("the Escape key closes the list, and then drops the typed text", async () => {
  const { onChoose, field } = setUp();
  await userEvent.clear(field);
  await userEvent.type(field, "123{ArrowDown}");
  expect(screen.getByRole("listbox")).toBeDefined();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(field.value).toBe("123");
  await userEvent.keyboard("{Escape}");
  expect(field.value).toBe("1:25,000");
  expect(onChoose).not.toHaveBeenCalled();
});

test("the Alt key with the down arrow opens the list without reaching a scale", async () => {
  const { field } = setUp();
  field.focus();
  await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
  expect(screen.getByRole("listbox")).toBeDefined();
  expect(field.getAttribute("aria-activedescendant")).toBeNull();
  await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("the button opens and closes the list, and a click on a scale chooses it", async () => {
  const { onChoose, field } = setUp();
  const button = screen.getByRole("button", { name: "Scales" });
  await userEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(field);
  await userEvent.click(screen.getByRole("option", { name: "1:10,000" }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(10_000);
  expect(screen.queryByRole("listbox")).toBeNull();
  await userEvent.click(button);
  await userEvent.click(button);
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("the list closes and the typed text is dropped when the field loses the keyboard focus", async () => {
  const { onChoose, field } = setUp();
  await userEvent.clear(field);
  await userEvent.type(field, "500{ArrowDown}");
  await userEvent.tab();
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(field.value).toBe("1:25,000");
  expect(onChoose).not.toHaveBeenCalled();
});
