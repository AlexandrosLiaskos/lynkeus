// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { resetStorage, setKeepAll, setPartKept, storageStore } from "../shared/storage/storage";
import { BOOKMARKS_KEY, bookmarksStore, readBookmarks, saveBookmark } from "./bookmarks";

const GOOD = { id: 1, name: "Merrimack", center: [-70.9, 42.8], zoom: 10, rotation: 0.5 };

function start() {
  return new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
}

beforeEach(() => {
  bookmarksStore.set([]);
  window.localStorage.clear();
  resetStorage();
});

test("the bookmarks are a part that the browser keeps, under the name and in the form that they had before", () => {
  expect(BOOKMARKS_KEY).toBe("lynkeus.bookmarks");
  expect(storageStore.get().parts.find(({ key }) => key === BOOKMARKS_KEY)).toMatchObject({
    title: "Bookmarks",
    kept: true,
  });
  expect(saveBookmark(start(), "Merrimack")).toBeNull();
  const stored: unknown = JSON.parse(window.localStorage.getItem(BOOKMARKS_KEY) ?? "null");
  expect(Array.isArray(stored)).toBe(true);
  expect(stored).toEqual(bookmarksStore.get());
});

test("bookmarks that were stored before return when the page opens, without what is not a bookmark", async () => {
  window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([GOOD, { ...GOOD, id: 2, name: "" }, "word"]));
  vi.resetModules();
  const fresh = await import("./bookmarks");
  expect(fresh.bookmarksStore.get()).toEqual([GOOD]);
});

test("a stored text that is not a list of bookmarks is removed when the page opens", async () => {
  window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify({ v: 1, value: [GOOD] }));
  vi.resetModules();
  const fresh = await import("./bookmarks");
  expect(fresh.bookmarksStore.get()).toEqual([]);
  expect(window.localStorage.getItem(BOOKMARKS_KEY)).toBeNull();
});

test("bookmarks whose switch is off last in the page, are not stored and give no sentence about the storage", () => {
  setPartKept(BOOKMARKS_KEY, false);
  expect(saveBookmark(start(), "First")).toBeNull();
  expect(bookmarksStore.get()).toHaveLength(1);
  expect(window.localStorage.getItem(BOOKMARKS_KEY)).toBeNull();
  expect(readBookmarks()).toEqual([]);
  setPartKept(BOOKMARKS_KEY, true);
  expect(readBookmarks()).toEqual(bookmarksStore.get());
  setKeepAll(false);
  expect(saveBookmark(start(), "Second")).toBeNull();
  expect(window.localStorage.getItem(BOOKMARKS_KEY)).toBeNull();
});
