// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat, toLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import {
  BOOKMARK_FAULTS,
  BOOKMARKS_KEY,
  bookmarksStore,
  isBookmark,
  readBookmarks,
  removeBookmark,
  renameBookmark,
  saveBookmark,
  showBookmark,
} from "./bookmarks";

function start(longitude: number, latitude: number, zoom: number, rotation = 0) {
  return new OlMap({ view: new View({ center: fromLonLat([longitude, latitude]), zoom, rotation }) });
}

beforeEach(() => {
  window.localStorage.clear();
  bookmarksStore.set([]);
  vi.unstubAllGlobals();
});

test("a view is saved under a name, in the store and in the local storage of the browser", () => {
  expect(saveBookmark(start(-70.9, 42.8, 10, 0.5), " Merrimack ")).toBeNull();
  const [bookmark] = bookmarksStore.get();
  expect(bookmark).toMatchObject({ id: 1, name: "Merrimack", zoom: 10, rotation: 0.5 });
  expect(bookmark?.center[0]).toBeCloseTo(-70.9, 9);
  expect(bookmark?.center[1]).toBeCloseTo(42.8, 9);
  expect(JSON.parse(window.localStorage.getItem(BOOKMARKS_KEY) ?? "")).toEqual(bookmarksStore.get());
  expect(readBookmarks()).toEqual(bookmarksStore.get());
});

test("the map returns to the view of a bookmark", () => {
  saveBookmark(start(-70.9, 42.8, 10, 0.5), "Merrimack");
  const map = start(0, 0, 2);
  const [bookmark] = bookmarksStore.get();
  if (!bookmark) {
    throw new Error("the bookmark was not saved");
  }
  showBookmark(map, bookmark, 0);
  const [longitude = 0, latitude = 0] = toLonLat(map.getView().getCenter() ?? [0, 0]);
  expect(longitude).toBeCloseTo(-70.9, 9);
  expect(latitude).toBeCloseTo(42.8, 9);
  expect(map.getView().getZoom()).toBe(10);
  expect(map.getView().getRotation()).toBe(0.5);
});

test("a name is needed, is not too long and is not used twice", () => {
  const map = start(0, 0, 2);
  expect(saveBookmark(map, "  ")).toBe(BOOKMARK_FAULTS.noName);
  expect(saveBookmark(map, "x".repeat(61))).toBe(BOOKMARK_FAULTS.longName);
  expect(saveBookmark(map, "First")).toBeNull();
  expect(saveBookmark(map, "First")).toBe(BOOKMARK_FAULTS.sameName);
  expect(bookmarksStore.get()).toHaveLength(1);
});

test("a bookmark is renamed and removed", () => {
  const map = start(0, 0, 2);
  saveBookmark(map, "First");
  saveBookmark(map, "Second");
  expect(renameBookmark(2, "First")).toBe(BOOKMARK_FAULTS.sameName);
  expect(renameBookmark(2, "Second")).toBeNull();
  expect(renameBookmark(2, "Third")).toBeNull();
  expect(bookmarksStore.get().map(({ id, name }) => [id, name])).toEqual([
    [1, "First"],
    [2, "Third"],
  ]);
  expect(removeBookmark(1)).toBeNull();
  expect(readBookmarks().map(({ name }) => name)).toEqual(["Third"]);
  // A new bookmark takes a number that no bookmark carries.
  saveBookmark(map, "Fourth");
  expect(bookmarksStore.get().map(({ id }) => id)).toEqual([2, 3]);
});

test("what the storage holds is read only when it is a list of bookmarks", () => {
  window.localStorage.setItem(BOOKMARKS_KEY, "not JSON");
  expect(readBookmarks()).toEqual([]);
  window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify({ id: 1 }));
  expect(readBookmarks()).toEqual([]);
  const good = { id: 1, name: "Good", center: [1, 2], zoom: 3, rotation: 0 };
  window.localStorage.setItem(
    BOOKMARKS_KEY,
    JSON.stringify([good, { ...good, center: [1] }, { ...good, name: "" }, null]),
  );
  expect(readBookmarks()).toEqual([good]);
  expect(isBookmark({ ...good, zoom: "3" })).toBe(false);
});

test("when the browser does not store the bookmarks, they last in the page and a sentence says so", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
  });
  expect(saveBookmark(start(0, 0, 2), "First")).toBe(BOOKMARK_FAULTS.notStored);
  expect(bookmarksStore.get()).toHaveLength(1);
});
