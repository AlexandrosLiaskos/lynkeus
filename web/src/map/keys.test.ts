// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test, vi } from "vitest";
import { createKeys } from "./keys";
import { pressKey } from "./testKeys";

test("a key runs its command, and the event is not passed on", () => {
  const back = vi.fn();
  const keys = createKeys({ ",": back });
  expect(pressKey(keys, ",")).toEqual({ passedOn: false, prevented: true });
  expect(back).toHaveBeenCalledTimes(1);
});

test("a letter runs its command in lower and in upper case", () => {
  const north = vi.fn();
  const keys = createKeys({ n: north });
  pressKey(keys, "n");
  pressKey(keys, "N");
  expect(north).toHaveBeenCalledTimes(2);
});

test("a key without a command, with a modifier key or inside a text field is left alone", () => {
  const command = vi.fn();
  const keys = createKeys({ a: command, Enter: command });
  expect(pressKey(keys, "b")).toEqual({ passedOn: true, prevented: false });
  expect(pressKey(keys, "a", { ctrlKey: true })).toEqual({ passedOn: true, prevented: false });
  expect(pressKey(keys, "a", { shiftKey: true }).passedOn).toBe(true);
  expect(pressKey(keys, "Enter", {}, document.createElement("input")).passedOn).toBe(true);
  expect(pressKey(keys, "toString").passedOn).toBe(true);
  expect(command).not.toHaveBeenCalled();
});
