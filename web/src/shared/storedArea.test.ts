// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test, vi } from "vitest";
import { AREA_KEY, areaStore, storedArea } from "./area";
import { resetStorage, setPartKept, storageStore } from "./storage/storage";

const AREA = { west: 22.2, south: 36.4, east: 22.6, north: 36.9 };

function stored(): unknown {
  const text = window.localStorage.getItem(AREA_KEY);
  return text === null ? null : JSON.parse(text);
}

beforeEach(() => {
  areaStore.set(null);
  window.localStorage.clear();
  resetStorage();
});

test("the area is a part that the browser keeps, and every change of it is stored", () => {
  expect(storageStore.get().parts.find(({ key }) => key === AREA_KEY)).toMatchObject({ title: "Area", kept: true });
  areaStore.set(AREA);
  expect(stored()).toEqual({ v: 1, value: AREA });
  areaStore.set(null);
  expect(stored()).toEqual({ v: 1, value: null });
});

test("the stored area returns when the page opens", async () => {
  window.localStorage.setItem(AREA_KEY, JSON.stringify({ v: 1, value: { ...AREA, name: "left out" } }));
  vi.resetModules();
  const fresh = await import("./area");
  expect(fresh.areaStore.get()).toEqual(AREA);
});

test.each([
  ["west is not smaller than east", { ...AREA, west: 30 }],
  ["a latitude is outside the limits", { ...AREA, north: 91 }],
  ["a side is a text", { ...AREA, south: "36.4" }],
  ["a side is missing", { west: 22.2, south: 36.4, east: 22.6 }],
  ["the value is a list", [22.2, 36.4, 22.6, 36.9]],
  ["the value is a text", "22.2,36.4,22.6,36.9"],
])("a stored area is refused and removed when %s", async (_reason, value) => {
  expect(storedArea(value)).toBeUndefined();
  window.localStorage.setItem(AREA_KEY, JSON.stringify({ v: 1, value }));
  vi.resetModules();
  const fresh = await import("./area");
  expect(fresh.areaStore.get()).toBeNull();
  expect(window.localStorage.getItem(AREA_KEY)).toBeNull();
});

test("a stored area is checked as no area or as the four sides of an area", () => {
  expect(storedArea(null)).toBeNull();
  expect(storedArea(AREA)).toEqual(AREA);
});

test("an area whose switch is off is not stored", () => {
  areaStore.set(AREA);
  setPartKept(AREA_KEY, false);
  expect(stored()).toBeNull();
  areaStore.set({ ...AREA, north: 37 });
  expect(stored()).toBeNull();
});
