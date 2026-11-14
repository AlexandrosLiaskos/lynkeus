import { useSyncExternalStore } from "react";

/** A value that several elements of the interface share. */
export interface Store<T> {
  get: () => T;
  set: (value: T) => void;
  /** Call the listener after every change. The function returned ends the subscription. */
  subscribe: (listener: () => void) => () => void;
}

/** Create a store that holds the given value. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (!Object.is(next, value)) {
        value = next;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Read a store in a component. The component is drawn again when the value changes. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
