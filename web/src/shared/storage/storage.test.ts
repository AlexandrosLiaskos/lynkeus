import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStore, type Store } from "../store";
import {
  checkStorage,
  clearAll,
  clearPart,
  formatBytes,
  keepInBrowser,
  OPTIONS_KEY,
  resetStorage,
  setKeepAll,
  setPartKept,
  storageStore,
  type KeptPart,
} from "./storage";

const KEY = "lynkeus.test-count";
const OTHER = "lynkeus.test-word";

let parts: KeptPart<unknown>[] = [];

/** Declare a part that holds a whole number from 0 to 100. */
function count(store: Store<number>, key = KEY, restore = true): KeptPart<number> {
  const part = keepInBrowser<number>({
    key,
    title: "Count",
    description: "A whole number from 0 to 100.",
    read: () => store.get(),
    check: (stored) =>
      typeof stored === "number" && Number.isInteger(stored) && stored >= 0 && stored <= 100 ? stored : undefined,
    restore: restore ? (value) => store.set(value) : undefined,
    subscribe: store.subscribe,
  });
  parts.push(part);
  return part;
}

function stored(key: string): unknown {
  const text = window.localStorage.getItem(key);
  return text === null ? null : JSON.parse(text);
}

function row(key: string) {
  return storageStore.get().parts.find((part) => part.key === key);
}

beforeEach(() => {
  window.localStorage.clear();
  resetStorage();
});

afterEach(() => {
  parts.forEach((part) => part.leave());
  parts = [];
  vi.unstubAllGlobals();
});

test("at the start everything is kept, nothing is stored and the browser does not refuse", () => {
  const store = createStore(1);
  count(store);
  expect(storageStore.get()).toMatchObject({ keep: true, refused: false });
  expect(row(KEY)).toEqual({
    key: KEY,
    title: "Count",
    description: "A whole number from 0 to 100.",
    kept: true,
    bytes: null,
    failed: false,
  });
  expect(window.localStorage.length).toBe(0);
});

test("every change of a part is stored with its version, and the size of the copy is reported", () => {
  const store = createStore(1);
  const part = count(store);
  store.set(7);
  expect(stored(KEY)).toEqual({ v: 1, value: 7 });
  expect(row(KEY)?.bytes).toBe('{"v":1,"value":7}'.length);
  expect(part.stored()).toBe(7);
  expect(part.failed()).toBe(false);
  store.set(42);
  expect(stored(KEY)).toEqual({ v: 1, value: 42 });
  expect(row(KEY)?.bytes).toBe('{"v":1,"value":42}'.length);
});

test("the size counts the bytes of the text in UTF-8", () => {
  const store = createStore("");
  parts.push(
    keepInBrowser<string>({
      key: OTHER,
      title: "Word",
      description: "A word.",
      read: () => store.get(),
      check: (value) => (typeof value === "string" ? value : undefined),
      restore: (value) => store.set(value),
      subscribe: store.subscribe,
    }),
  );
  store.set("é");
  expect(row(OTHER)?.bytes).toBe('{"v":1,"value":""}'.length + 2);
});

test("a stored value is restored once, when the part is declared", () => {
  window.localStorage.setItem(KEY, JSON.stringify({ v: 1, value: 30 }));
  const store = createStore(1);
  count(store);
  expect(store.get()).toBe(30);
  expect(row(KEY)?.bytes).toBe('{"v":1,"value":30}'.length);
  // A later change of the storage, for example by another window, does not reach the page.
  window.localStorage.setItem(KEY, JSON.stringify({ v: 1, value: 55 }));
  expect(store.get()).toBe(30);
});

test.each([
  ["a text that is not JSON", "{not JSON"],
  ["a value without a version", JSON.stringify(30)],
  ["another version", JSON.stringify({ v: 2, value: 30 })],
  ["a version without a value", JSON.stringify({ v: 1 })],
  ["a value of the wrong type", JSON.stringify({ v: 1, value: "30" })],
  ["a value outside its range", JSON.stringify({ v: 1, value: 101 })],
  ["a list in place of the record", JSON.stringify([1, 30])],
])("%s is ignored and removed", (_, text) => {
  window.localStorage.setItem(KEY, text);
  const store = createStore(1);
  const part = count(store);
  expect(store.get()).toBe(1);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  expect(part.stored()).toBeUndefined();
  expect(row(KEY)?.bytes).toBeNull();
});

test("a part without a restore is not restored when it is declared, and gives its stored value when asked", () => {
  window.localStorage.setItem(KEY, JSON.stringify({ v: 1, value: 30 }));
  const store = createStore(1);
  const part = count(store, KEY, false);
  expect(store.get()).toBe(1);
  expect(part.stored()).toBe(30);
  setPartKept(KEY, false);
  expect(part.stored()).toBeUndefined();
});

test("a part that has nothing to store leaves its stored copy as it is", () => {
  window.localStorage.setItem(KEY, JSON.stringify({ v: 1, value: 30 }));
  const store = createStore<number | null>(null);
  parts.push(
    keepInBrowser<number>({
      key: KEY,
      title: "Count",
      description: "A whole number.",
      read: () => store.get() ?? undefined,
      check: (value) => (typeof value === "number" ? value : undefined),
      subscribe: store.subscribe,
    }),
  );
  store.set(null);
  setPartKept(OTHER, false);
  expect(stored(KEY)).toEqual({ v: 1, value: 30 });
  store.set(4);
  expect(stored(KEY)).toEqual({ v: 1, value: 4 });
});

test("a plain part is stored without its version, as its older copies are", () => {
  window.localStorage.setItem(KEY, JSON.stringify([1, 2]));
  const store = createStore<readonly number[]>([]);
  parts.push(
    keepInBrowser<readonly number[]>({
      key: KEY,
      title: "Numbers",
      description: "A list of numbers.",
      plain: true,
      read: () => store.get(),
      check: (value) =>
        Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : undefined,
      restore: (value) => store.set(value),
      subscribe: store.subscribe,
    }),
  );
  expect(store.get()).toEqual([1, 2]);
  store.set([1, 2, 3]);
  expect(stored(KEY)).toEqual([1, 2, 3]);
});

test("the switch of a part removes its stored copy, stops the storing and starts it again", () => {
  const store = createStore(1);
  const word = createStore(5);
  count(store);
  count(word, OTHER);
  store.set(2);
  word.set(6);
  setPartKept(KEY, false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  expect(row(KEY)).toMatchObject({ kept: false, bytes: null });
  expect(stored(OTHER)).toEqual({ v: 1, value: 6 });
  expect(stored(OPTIONS_KEY)).toEqual({ v: 1, value: { keep: true, parts: { [KEY]: false } } });
  store.set(3);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  // Switched on again, the part is stored at once.
  setPartKept(KEY, true);
  expect(stored(KEY)).toEqual({ v: 1, value: 3 });
  expect(row(KEY)).toMatchObject({ kept: true, bytes: '{"v":1,"value":3}'.length });
});

test("a part whose switch is off is not restored, and its stored copy is removed", () => {
  setPartKept(KEY, false);
  window.localStorage.setItem(KEY, JSON.stringify({ v: 1, value: 30 }));
  const store = createStore(1);
  count(store);
  expect(store.get()).toBe(1);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

test("the main switch removes every stored copy and keeps the options, and stores the parts again", () => {
  const store = createStore(1);
  const word = createStore(5);
  count(store);
  count(word, OTHER);
  setPartKept(OTHER, false);
  store.set(2);
  setKeepAll(false);
  expect(storageStore.get().keep).toBe(false);
  expect(Object.keys(window.localStorage)).toEqual([OPTIONS_KEY]);
  expect(stored(OPTIONS_KEY)).toEqual({ v: 1, value: { keep: false, parts: { [OTHER]: false } } });
  // The switch of each part stays as the user set it.
  expect(row(KEY)?.kept).toBe(true);
  expect(row(OTHER)?.kept).toBe(false);
  store.set(3);
  word.set(6);
  expect(Object.keys(window.localStorage)).toEqual([OPTIONS_KEY]);
  setKeepAll(true);
  expect(stored(KEY)).toEqual({ v: 1, value: 3 });
  expect(window.localStorage.getItem(OTHER)).toBeNull();
});

test("the stored copy of one part is cleared, the page keeps its value and the next change is stored", () => {
  const store = createStore(1);
  const word = createStore(5);
  count(store);
  count(word, OTHER);
  store.set(2);
  word.set(6);
  clearPart(KEY);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  expect(row(KEY)).toMatchObject({ kept: true, bytes: null });
  expect(store.get()).toBe(2);
  expect(stored(OTHER)).toEqual({ v: 1, value: 6 });
  store.set(3);
  expect(stored(KEY)).toEqual({ v: 1, value: 3 });
});

test("every stored copy is cleared, also one that no part owns, and the options and other sites' names stay", () => {
  const store = createStore(1);
  count(store);
  store.set(2);
  setPartKept(OTHER, false);
  window.localStorage.setItem("lynkeus.left-over", "old");
  window.localStorage.setItem("another-program", "kept");
  clearAll();
  expect(Object.keys(window.localStorage).sort()).toEqual(["another-program", OPTIONS_KEY]);
  expect(row(KEY)?.bytes).toBeNull();
  expect(store.get()).toBe(2);
});

test("options that cannot be read are removed, and the first options take their place", async () => {
  window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ v: 1, value: { keep: "no", parts: {} } }));
  vi.resetModules();
  const fresh = await import("./storage");
  expect(fresh.storageStore.get().keep).toBe(true);
  expect(window.localStorage.getItem(OPTIONS_KEY)).toBeNull();
});

test("the stored options are read when the page opens", async () => {
  window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ v: 1, value: { keep: true, parts: { [KEY]: false } } }));
  window.localStorage.setItem(KEY, JSON.stringify({ v: 1, value: 30 }));
  vi.resetModules();
  const fresh = await import("./storage");
  const store = createStore(1);
  const part = fresh.keepInBrowser<number>({
    key: KEY,
    title: "Count",
    description: "A whole number.",
    read: () => store.get(),
    check: (value) => (typeof value === "number" ? value : undefined),
    restore: (value) => store.set(value),
    subscribe: store.subscribe,
  });
  expect(store.get()).toBe(1);
  expect(fresh.storageStore.get().parts).toMatchObject([{ key: KEY, kept: false, bytes: null }]);
  part.leave();
});

test("a part that is declared again under its name takes the place of the earlier one", () => {
  const first = createStore(1);
  const second = createStore(10);
  count(first);
  count(second);
  expect(storageStore.get().parts.filter((part) => part.key === KEY)).toHaveLength(1);
  first.set(2);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  second.set(11);
  expect(stored(KEY)).toEqual({ v: 1, value: 11 });
});

test("a part that has left is not listed and is not stored any more", () => {
  const store = createStore(1);
  const part = count(store);
  store.set(2);
  part.leave();
  expect(row(KEY)).toBeUndefined();
  store.set(3);
  expect(stored(KEY)).toEqual({ v: 1, value: 2 });
});

test("the parts are listed by their titles", () => {
  const store = createStore(1);
  for (const [key, title] of [
    ["lynkeus.test-b", "Beta"],
    ["lynkeus.test-c", "Gamma"],
    ["lynkeus.test-a", "Alpha"],
  ] as const) {
    parts.push(
      keepInBrowser<number>({
        key,
        title,
        description: "A number.",
        read: () => store.get(),
        check: (value) => (typeof value === "number" ? value : undefined),
        subscribe: store.subscribe,
      }),
    );
  }
  expect(storageStore.get().parts.map(({ title }) => title)).toEqual(["Alpha", "Beta", "Gamma"]);
});

test("when the browser refuses the storage, the module says so and the page works without it", () => {
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse, key: refuse, length: 0 });
  checkStorage();
  expect(storageStore.get().refused).toBe(true);
  const store = createStore(1);
  const part = count(store);
  expect(store.get()).toBe(1);
  store.set(2);
  expect(store.get()).toBe(2);
  expect(part.failed()).toBe(true);
  expect(part.stored()).toBeUndefined();
  expect(row(KEY)).toMatchObject({ bytes: null, failed: true });
  expect(() => {
    setPartKept(KEY, false);
    setKeepAll(false);
    setKeepAll(true);
    clearPart(KEY);
    clearAll();
  }).not.toThrow();

  // The browser stores again: the next change is stored and the refusal is over.
  vi.unstubAllGlobals();
  setPartKept(KEY, true);
  store.set(3);
  expect(storageStore.get().refused).toBe(false);
  expect(part.failed()).toBe(false);
  expect(stored(KEY)).toEqual({ v: 1, value: 3 });
});

test("a browser without a storage at all is a browser that refuses it", () => {
  vi.stubGlobal("localStorage", undefined);
  checkStorage();
  expect(storageStore.get().refused).toBe(true);
  const store = createStore(1);
  count(store);
  expect(() => store.set(2)).not.toThrow();
});

test("a size is written in a readable unit", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(999)).toBe("999 B");
  expect(formatBytes(1000)).toBe("1.0 kB");
  expect(formatBytes(1234)).toBe("1.2 kB");
  expect(formatBytes(999_960)).toBe("1.0 MB");
  expect(formatBytes(3_400_000)).toBe("3.4 MB");
  expect(formatBytes(5_000_000_000)).toBe("5.0 GB");
  expect(formatBytes(2_500_000_000_000)).toBe("2500.0 GB");
});
