// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { createStore } from "../store";

/** The start of the name of everything that Lynkeus keeps in the local storage of the browser. */
export const STORAGE_PREFIX = "lynkeus.";

/** The name under which the options of the storage are kept. */
export const OPTIONS_KEY = `${STORAGE_PREFIX}options`;

/** The name that is written and removed at once to learn whether the browser stores anything for the page. */
const PROBE_KEY = `${STORAGE_PREFIX}probe`;

/** The version of the form in which a part is stored. A stored copy of another version is removed. */
const VERSION = 1;

/** The choices of the user: whether anything is kept in the browser, and whether each part is. */
export interface StorageOptions {
  /** The main switch. While it is off, nothing but these options is kept. */
  keep: boolean;
  /** The switch of each part, by the name of the part. A part that is not named here is kept. */
  parts: Readonly<Record<string, boolean>>;
}

const DEFAULTS: StorageOptions = { keep: true, parts: {} };

/** A part of the work that is kept in the browser, as its owner declares it. */
export interface StoredPart<T> {
  /** The name under which the part is stored. It starts with `lynkeus.`. */
  key: string;
  /** Name of the part, as the pane Browser storage lists it. */
  title: string;
  /** What the part holds, in one sentence. */
  description: string;
  /** Return the value that the page holds now, or undefined when there is nothing to store at this moment. */
  read: () => T | undefined;
  /**
   * Check a value that was read from the storage, which may hold anything. Return the value when its types and
   * its ranges are right, and undefined otherwise; the stored copy is then removed.
   */
  check: (stored: unknown) => T | undefined;
  /**
   * Bring a stored value into the page. It is called once, when the part is declared. A part without it is not
   * restored at that moment: its owner asks for the stored value with `stored()` when the time has come.
   */
  restore?: (value: T) => void;
  /** Call the listener after every change of the value. The function returned ends the subscription. */
  subscribe: (listener: () => void) => () => void;
  /**
   * Whether the value is stored as it is, without its version. Only a part whose stored copies are older than
   * this module has it, so that those copies are still read.
   */
  plain?: boolean;
}

/** What the owner of a part receives when it declares the part. */
export interface KeptPart<T> {
  /** Return the stored value when the part is kept and the value is valid, and undefined otherwise. */
  stored: () => T | undefined;
  /** Tell whether the browser refused the last attempt to store the part. */
  failed: () => boolean;
  /** End the keeping of the part. Its stored copy stays. */
  leave: () => void;
}

/** A part as the pane Browser storage lists it. */
export interface PartReport {
  key: string;
  title: string;
  description: string;
  /** The switch of the part. */
  kept: boolean;
  /** The size of the stored copy in bytes, or null when nothing is stored. */
  bytes: number | null;
  /** Whether the browser refused the last attempt to store the part. */
  failed: boolean;
}

/** The state of the storage: the main switch, whether the browser refuses storage, and the parts by title. */
export interface StorageReport {
  keep: boolean;
  refused: boolean;
  parts: readonly PartReport[];
}

interface Entry {
  key: string;
  title: string;
  description: string;
  bytes: number | null;
  failed: boolean;
  save: () => void;
  stop: () => void;
}

const entries = new Map<string, Entry>();
let refused = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the number of bytes of a text in UTF-8. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Tell whether the browser stores something for the page, by writing a short text and removing it. */
function probe(): boolean {
  try {
    window.localStorage.setItem(PROBE_KEY, "1");
    window.localStorage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Read a stored text. A browser that refuses the storage gives null. */
function readText(key: string): string | null {
  try {
    const text: unknown = window.localStorage.getItem(key);
    return typeof text === "string" ? text : null;
  } catch {
    refused = true;
    return null;
  }
}

/** Store a text, and return whether the browser stored it. */
function writeText(key: string, text: string): boolean {
  try {
    window.localStorage.setItem(key, text);
    refused = false;
    return true;
  } catch {
    refused = !probe();
    return false;
  }
}

/** Remove a stored text. */
function removeText(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    refused = true;
  }
}

/** Return the names of everything that the storage holds for Lynkeus, except its options. */
function storedKeys(): string[] {
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    return keys.filter((key): key is string => key !== null && key.startsWith(STORAGE_PREFIX) && key !== OPTIONS_KEY);
  } catch {
    return [];
  }
}

/** Return the value of a stored text, or undefined when the text cannot be read or has another version. */
function unwrap(text: string, plain: boolean): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    if (plain) {
      return parsed;
    }
    return isRecord(parsed) && parsed.v === VERSION ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function wrap(value: unknown, plain: boolean): string {
  return JSON.stringify(plain ? value : { v: VERSION, value });
}

/** Read the options. Options that cannot be read are removed, and the first options take their place. */
function readOptions(): StorageOptions {
  const text = readText(OPTIONS_KEY);
  if (text === null) {
    return DEFAULTS;
  }
  const stored = unwrap(text, false);
  if (
    isRecord(stored) &&
    typeof stored.keep === "boolean" &&
    isRecord(stored.parts) &&
    Object.values(stored.parts).every((choice) => typeof choice === "boolean")
  ) {
    return { keep: stored.keep, parts: { ...(stored.parts as Record<string, boolean>) } };
  }
  removeText(OPTIONS_KEY);
  return DEFAULTS;
}

refused = !probe();
let options = readOptions();

function isKept(key: string): boolean {
  return options.keep && options.parts[key] !== false;
}

function report(): StorageReport {
  return {
    keep: options.keep,
    refused,
    parts: [...entries.values()]
      .sort((one, other) => one.title.localeCompare(other.title, "en"))
      .map(({ key, title, description, bytes, failed }) => ({
        key,
        title,
        description,
        kept: options.parts[key] !== false,
        bytes,
        failed,
      })),
  };
}

/** The state of the storage. The pane Browser storage shows it. */
export const storageStore = createStore<StorageReport>(report());

function publish(): void {
  storageStore.set(report());
}

/** Return the size of the stored copy of a part in bytes, or null when nothing is stored. */
function sizeOf(key: string): number | null {
  const text = readText(key);
  return text === null ? null : byteLength(text);
}

/** Remove the stored copy of a part. */
function forget(entry: Entry): void {
  removeText(entry.key);
  entry.bytes = null;
  entry.failed = false;
}

/**
 * Keep a part of the work in the local storage of the browser. The stored value is restored once, at this
 * moment, when the part is kept and the value is valid; a value that cannot be read, has another version or
 * fails the check of the part is removed. Afterwards every change is stored while the part is kept. A part
 * that is declared again under the same name takes the place of the earlier one.
 */
export function keepInBrowser<T>(part: StoredPart<T>): KeptPart<T> {
  const { key, title, description } = part;
  const plain = part.plain === true;
  entries.get(key)?.stop();

  const entry: Entry = {
    key,
    title,
    description,
    bytes: null,
    failed: false,
    save: () => undefined,
    stop: () => undefined,
  };

  const stored = (): T | undefined => {
    if (!isKept(key)) {
      return undefined;
    }
    const text = readText(key);
    const raw = text === null ? undefined : unwrap(text, plain);
    const value = raw === undefined ? undefined : part.check(raw);
    const bytes = text === null || value === undefined ? null : byteLength(text);
    if (text !== null && value === undefined) {
      removeText(key);
    }
    if (bytes !== entry.bytes) {
      entry.bytes = bytes;
      publish();
    }
    return value;
  };

  entry.save = () => {
    if (!isKept(key)) {
      return;
    }
    const value = part.read();
    if (value === undefined) {
      return;
    }
    const text = wrap(value, plain);
    entry.failed = !writeText(key, text);
    entry.bytes = entry.failed ? sizeOf(key) : byteLength(text);
    publish();
  };

  entries.set(key, entry);
  if (!isKept(key)) {
    removeText(key);
  }
  const value = stored();
  if (value !== undefined) {
    part.restore?.(value);
  }
  const end = part.subscribe(entry.save);
  entry.stop = () => {
    end();
    if (entries.get(key) === entry) {
      entries.delete(key);
      publish();
    }
  };
  publish();

  return { stored, failed: () => entry.failed, leave: () => entry.stop() };
}

/** Keep the options in the storage, and store or remove the parts as the options say. */
function apply(next: StorageOptions): void {
  options = next;
  writeText(OPTIONS_KEY, wrap(options, false));
  for (const entry of entries.values()) {
    if (!isKept(entry.key)) {
      forget(entry);
    } else if (entry.bytes === null) {
      entry.save();
    }
  }
  publish();
}

/**
 * Set the main switch. Switched off, it removes the stored copy of every part; the options stay, because they
 * hold this choice. Switched on, it stores at once every part whose own switch is on.
 */
export function setKeepAll(keep: boolean): void {
  apply({ ...options, keep });
}

/** Set the switch of one part. Switched off, it removes the stored copy of the part. */
export function setPartKept(key: string, kept: boolean): void {
  apply({ ...options, parts: { ...options.parts, [key]: kept } });
}

/** Remove the stored copy of one part. The work on the page stays, and the next change of the part is stored. */
export function clearPart(key: string): void {
  const entry = entries.get(key);
  if (entry) {
    forget(entry);
    publish();
  }
}

/** Remove every stored copy. The options stay, and so does the work on the page. */
export function clearAll(): void {
  entries.forEach(forget);
  storedKeys().forEach(removeText);
  publish();
}

/**
 * Look at the storage again: whether the browser stores anything for the page, and the size of each stored
 * copy. The pane Browser storage calls it when it opens.
 */
export function checkStorage(): void {
  refused = !probe();
  for (const entry of entries.values()) {
    entry.bytes = sizeOf(entry.key);
  }
  publish();
}

/** Return to the first options and look at the storage again. The tests start from this state. */
export function resetStorage(): void {
  options = DEFAULTS;
  for (const entry of entries.values()) {
    entry.failed = false;
  }
  checkStorage();
}

const UNITS = ["kB", "MB", "GB"] as const;

/** Write a size in bytes in a readable unit, as "512 B" or "1.2 kB" (1 kB is 1000 B). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) {
    return `${String(Math.round(bytes))} B`;
  }
  let value = bytes / 1000;
  let unit = 0;
  while (Number(value.toFixed(1)) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unit] ?? "GB"}`;
}
