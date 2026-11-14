import { expect, test, vi } from "vitest";
import { createStore } from "./store";

test("a store returns the value that was set last", () => {
  const store = createStore(1);
  expect(store.get()).toBe(1);
  store.set(2);
  expect(store.get()).toBe(2);
});

test("a listener is called after each change and not after an equal value", () => {
  const store = createStore("a");
  const listener = vi.fn();
  store.subscribe(listener);
  store.set("b");
  store.set("b");
  expect(listener).toHaveBeenCalledTimes(1);
});

test("a listener is not called after its subscription ends", () => {
  const store = createStore(0);
  const listener = vi.fn();
  const end = store.subscribe(listener);
  end();
  store.set(1);
  expect(listener).not.toHaveBeenCalled();
});
