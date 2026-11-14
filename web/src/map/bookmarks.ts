import type OlMap from "ol/Map";
import { fromLonLat, toLonLat } from "ol/proj";
import { createStore } from "../shared/store";

/** A view of the map that the user has saved under a name. */
export interface Bookmark {
  id: number;
  name: string;
  /** Longitude and latitude of the centre of the view, in degrees. */
  center: readonly [number, number];
  /** Zoom level of the view. */
  zoom: number;
  /** Rotation of the view in radians, clockwise. */
  rotation: number;
}

/** The name under which the bookmarks are kept in the local storage of the browser. */
export const BOOKMARKS_KEY = "lynkeus.bookmarks";

/** The largest number of characters of the name of a bookmark. */
export const NAME_LENGTH = 60;

export const BOOKMARK_FAULTS = {
  noName: "Give the bookmark a name.",
  longName: `The name of a bookmark has at most ${String(NAME_LENGTH)} characters.`,
  sameName: "Another bookmark has this name.",
  notStored: "The browser did not store the bookmarks. They last until this page is closed.",
} as const;

/** Tell whether a value that was read from the storage is a bookmark. */
export function isBookmark(value: unknown): value is Bookmark {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { id, name, center, zoom, rotation } = value as Record<string, unknown>;
  return (
    typeof id === "number" &&
    Number.isInteger(id) &&
    typeof name === "string" &&
    name !== "" &&
    Array.isArray(center) &&
    center.length === 2 &&
    center.every((angle) => typeof angle === "number" && Number.isFinite(angle)) &&
    typeof zoom === "number" &&
    Number.isFinite(zoom) &&
    typeof rotation === "number" &&
    Number.isFinite(rotation)
  );
}

/** Read the bookmarks from the local storage. Whatever is not a bookmark there is left out. */
export function readBookmarks(): Bookmark[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isBookmark) : [];
  } catch {
    return [];
  }
}

/** The bookmarks, in the order in which they were saved. */
export const bookmarksStore = createStore<readonly Bookmark[]>(readBookmarks());

/** Keep the bookmarks in the store and in the local storage. Returns false when the browser did not store them. */
function keep(bookmarks: readonly Bookmark[]): boolean {
  bookmarksStore.set(bookmarks);
  try {
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return true;
  } catch {
    return false;
  }
}

/** The outcome of a change of the bookmarks: null, or the sentence that says what went wrong. */
export type BookmarkFault = string | null;

/** Return the sentence that says why a name cannot be given to a bookmark, or null when it can. */
export function nameFault(name: string, except?: number): BookmarkFault {
  const trimmed = name.trim();
  if (trimmed === "") {
    return BOOKMARK_FAULTS.noName;
  }
  if (trimmed.length > NAME_LENGTH) {
    return BOOKMARK_FAULTS.longName;
  }
  return bookmarksStore.get().some((bookmark) => bookmark.id !== except && bookmark.name === trimmed)
    ? BOOKMARK_FAULTS.sameName
    : null;
}

/** Save the view that the map shows under a name. */
export function saveBookmark(map: OlMap, name: string): BookmarkFault {
  const fault = nameFault(name);
  const view = map.getView();
  const center = view.getCenter();
  const zoom = view.getZoom();
  if (fault || !center || zoom === undefined) {
    return fault;
  }
  const [longitude = 0, latitude = 0] = toLonLat(center, view.getProjection());
  const bookmarks = bookmarksStore.get();
  const id = bookmarks.reduce((highest, bookmark) => Math.max(highest, bookmark.id), 0) + 1;
  const bookmark: Bookmark = {
    id,
    name: name.trim(),
    center: [longitude, latitude],
    zoom,
    rotation: view.getRotation(),
  };
  return keep([...bookmarks, bookmark]) ? null : BOOKMARK_FAULTS.notStored;
}

/** Give a bookmark another name. */
export function renameBookmark(id: number, name: string): BookmarkFault {
  const fault = nameFault(name, id);
  if (fault) {
    return fault;
  }
  const renamed = bookmarksStore
    .get()
    .map((bookmark) => (bookmark.id === id ? { ...bookmark, name: name.trim() } : bookmark));
  return keep(renamed) ? null : BOOKMARK_FAULTS.notStored;
}

/** Remove a bookmark. */
export function removeBookmark(id: number): BookmarkFault {
  return keep(bookmarksStore.get().filter((bookmark) => bookmark.id !== id)) ? null : BOOKMARK_FAULTS.notStored;
}

/** Return the map to the view of a bookmark. */
export function showBookmark(map: OlMap, bookmark: Bookmark, duration = 250): void {
  const view = map.getView();
  view.animate({
    center: fromLonLat([...bookmark.center], view.getProjection()),
    zoom: bookmark.zoom,
    rotation: bookmark.rotation,
    duration,
  });
}
