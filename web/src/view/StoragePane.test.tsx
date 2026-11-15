import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openToolPane, resetDock } from "../shared/dock/dock";
import { keepInBrowser, OPTIONS_KEY, resetStorage, type KeptPart } from "../shared/storage/storage";
import { createStore, type Store } from "../shared/store";
import { SESSION_COOKIE, STORAGE_PANE, STORAGE_TEXTS, StoragePane } from "./StoragePane";

const ALPHA = "lynkeus.test-alpha";
const BETA = "lynkeus.test-beta";

let alpha: Store<string>;
let beta: Store<string>;
let parts: KeptPart<string>[] = [];

function word(key: string, title: string, store: Store<string>): void {
  parts.push(
    keepInBrowser<string>({
      key,
      title,
      description: `The word of ${title}.`,
      read: () => store.get(),
      check: (stored) => (typeof stored === "string" ? stored : undefined),
      restore: (value) => store.set(value),
      subscribe: store.subscribe,
    }),
  );
}

/** Give the browser of the test the functions that report the space of a site, or take them away. */
function setManager(manager: object | undefined): void {
  Object.defineProperty(navigator, "storage", { value: manager, configurable: true });
}

function show(): HTMLElement {
  render(<StoragePane />);
  act(() => openToolPane(STORAGE_PANE));
  return screen.getByRole("complementary", { name: "Browser storage" });
}

function box(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("checkbox", { name });
}

/** Return the row of a part: the item of the list that holds its check box. */
function row(name: string): HTMLElement {
  const item = box(name).closest("li");
  if (!item) {
    throw new Error(`The pane has no row ${name}.`);
  }
  return item;
}

function section(title: string): Element {
  const element = screen.getByRole("button", { name: title }).closest(".section");
  if (!element) {
    throw new Error(`The pane has no section ${title}.`);
  }
  return element;
}

beforeEach(() => {
  resetDock();
  window.localStorage.clear();
  resetStorage();
  setManager(undefined);
  alpha = createStore("a");
  beta = createStore("b");
  word(ALPHA, "Alpha", alpha);
  word(BETA, "Beta words", beta);
});

afterEach(() => {
  parts.forEach((part) => part.leave());
  parts = [];
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "storage");
});

test("the pane opens from its name and is not on the page before", () => {
  render(<StoragePane />);
  expect(screen.queryByRole("complementary", { name: "Browser storage" })).toBeNull();
  act(() => openToolPane(STORAGE_PANE));
  const pane = screen.getByRole("complementary", { name: "Browser storage" });
  expect(within(pane).getByRole("button", { name: /^Kept in this browser/ })).toBeDefined();
  expect(within(pane).getByRole("button", { name: "Space" })).toBeDefined();
  expect(within(pane).getByRole("button", { name: "Not kept by Lynkeus" })).toBeDefined();
  // No notice says that the browser refuses the storage or that nothing is kept.
  expect(screen.queryByText(STORAGE_TEXTS.refused)).toBeNull();
  expect(screen.queryByText(STORAGE_TEXTS.off)).toBeNull();
});

test("the first section holds the main switch and a row for each part, with its explanation and its size", () => {
  alpha.set("word");
  show();
  expect(box("Keep my work in this browser").checked).toBe(true);
  const list = screen.getByRole("list", { name: "Parts of the work" });
  expect(within(list).getAllByRole("checkbox")).toHaveLength(2);
  expect(box("Alpha").checked).toBe(true);
  expect(box("Alpha").getAttribute("aria-disabled")).toBeNull();
  expect(within(row("Alpha")).getByText(`${String('{"v":1,"value":"word"}'.length)} B`)).toBeDefined();
  expect(within(row("Beta words")).getByText("Nothing stored")).toBeDefined();
  // The explanation of a part stands behind the "i" beside its name, and it describes the check box.
  const info = within(row("Alpha")).getByRole("button", { name: "Information about Alpha" });
  expect(info).toBeDefined();
  const described = box("Alpha").getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(described)?.textContent).toBe("The word of Alpha.");
});

test("the size of a part follows its changes while the pane is open", () => {
  show();
  expect(within(row("Alpha")).getByText("Nothing stored")).toBeDefined();
  act(() => alpha.set("x".repeat(1200)));
  expect(within(row("Alpha")).getByText("1.2 kB")).toBeDefined();
});

test("the check box of a part removes its stored copy and stores the part again", async () => {
  alpha.set("word");
  beta.set("other");
  show();
  await userEvent.click(box("Alpha"));
  expect(box("Alpha").checked).toBe(false);
  expect(window.localStorage.getItem(ALPHA)).toBeNull();
  expect(window.localStorage.getItem(BETA)).not.toBeNull();
  expect(within(row("Alpha")).getByText("Nothing stored")).toBeDefined();
  expect(alpha.get()).toBe("word");
  await userEvent.click(box("Alpha"));
  expect(box("Alpha").checked).toBe(true);
  expect(window.localStorage.getItem(ALPHA)).toBe('{"v":1,"value":"word"}');
});

test("the main switch removes every stored copy, and the parts are inactive and say why", async () => {
  alpha.set("word");
  beta.set("other");
  show();
  await userEvent.click(box("Keep my work in this browser"));
  expect(box("Keep my work in this browser").checked).toBe(false);
  expect(Object.keys(window.localStorage)).toEqual([OPTIONS_KEY]);
  const notice = screen.getByText(STORAGE_TEXTS.off);
  expect(notice.getAttribute("role")).toBe("status");
  for (const name of ["Alpha", "Beta words"]) {
    expect(box(name).getAttribute("aria-disabled")).toBe("true");
    expect(box(name).disabled).toBe(false);
    expect(box(name).getAttribute("aria-describedby")?.split(" ")).toContain(notice.id);
  }
  // An inactive check box keeps its state when it is pressed.
  await userEvent.click(box("Alpha"));
  expect(box("Alpha").checked).toBe(true);
  expect(Object.keys(window.localStorage)).toEqual([OPTIONS_KEY]);
  await userEvent.click(box("Keep my work in this browser"));
  expect(screen.queryByText(STORAGE_TEXTS.off)).toBeNull();
  expect(box("Alpha").getAttribute("aria-disabled")).toBeNull();
  expect(window.localStorage.getItem(ALPHA)).toBe('{"v":1,"value":"word"}');
});

test("the Clear button of a part removes its stored copy only, and is inactive while nothing is stored", async () => {
  alpha.set("word");
  beta.set("other");
  show();
  const clear = within(row("Alpha")).getByRole("button", { name: "Clear the stored alpha" });
  expect(clear.getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(clear);
  expect(window.localStorage.getItem(ALPHA)).toBeNull();
  expect(window.localStorage.getItem(BETA)).not.toBeNull();
  expect(alpha.get()).toBe("word");
  expect(box("Alpha").checked).toBe(true);
  expect(within(row("Alpha")).getByText("Nothing stored")).toBeDefined();
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(clear.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
    STORAGE_TEXTS.noCopy,
  );
  // The next change of the part is stored again.
  act(() => alpha.set("next"));
  expect(window.localStorage.getItem(ALPHA)).toBe('{"v":1,"value":"next"}');
  expect(within(row("Beta words")).getByRole("button", { name: "Clear the stored beta words" })).toBeDefined();
});

test("the button Clear all is an outline button that removes every stored copy and keeps the work", async () => {
  alpha.set("word");
  beta.set("other");
  show();
  const clear = screen.getByRole("button", { name: "Clear all" });
  expect(clear.className).toBe("usa-button usa-button--outline");
  expect(document.querySelector(".usa-button:not(.usa-button--outline)")).toBeNull();
  expect(clear.getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(clear);
  expect(window.localStorage.getItem(ALPHA)).toBeNull();
  expect(window.localStorage.getItem(BETA)).toBeNull();
  expect([alpha.get(), beta.get()]).toEqual(["word", "other"]);
  expect(box("Alpha").checked).toBe(true);
  expect(screen.getAllByText("Nothing stored")).toHaveLength(2);
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(clear.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
    STORAGE_TEXTS.nothingAtAll,
  );
});

test("the section Space states the bytes used and allowed, and asks the browser to keep the data", async () => {
  const persist = vi.fn(() => Promise.resolve(true));
  setManager({
    estimate: () => Promise.resolve({ usage: 1234, quota: 5_000_000_000 }),
    persisted: () => Promise.resolve(false),
    persist,
  });
  show();
  const space = section("Space");
  expect(await within(space).findByText("1.2 kB")).toBeDefined();
  expect(within(space).getByText("5.0 GB")).toBeDefined();
  expect(within(space).getByText("Used by this site")).toBeDefined();
  expect(within(space).getByText("Allowed by the browser")).toBeDefined();
  expect(await within(space).findByText(STORAGE_TEXTS.mayClear)).toBeDefined();
  await userEvent.click(within(space).getByRole("button", { name: "Ask the browser to keep the data" }));
  expect(persist).toHaveBeenCalledTimes(1);
  expect(await within(space).findByText(STORAGE_TEXTS.agreed)).toBeDefined();
  expect(within(space).queryByText(STORAGE_TEXTS.mayClear)).toBeNull();
  expect(within(space).queryByRole("button", { name: "Ask the browser to keep the data" })).toBeNull();
});

test("the section Space states the answer of a browser that does not agree to keep the data", async () => {
  setManager({
    estimate: () => Promise.resolve({}),
    persisted: () => Promise.resolve(false),
    persist: () => Promise.resolve(false),
  });
  show();
  const space = section("Space");
  expect(await within(space).findAllByText("Not reported")).toHaveLength(2);
  await userEvent.click(await within(space).findByRole("button", { name: "Ask the browser to keep the data" }));
  expect(await within(space).findByText(STORAGE_TEXTS.declined)).toBeDefined();
  expect(within(space).getByRole("button", { name: "Ask the browser to keep the data" })).toBeDefined();
});

test("the section Space says that the browser keeps the data when it already does", async () => {
  setManager({ persisted: () => Promise.resolve(true), persist: () => Promise.resolve(true) });
  show();
  const space = section("Space");
  expect(await within(space).findByText(STORAGE_TEXTS.keeps)).toBeDefined();
  expect(within(space).queryByRole("button", { name: "Ask the browser to keep the data" })).toBeNull();
  expect(within(space).queryByText("Used by this site")).toBeNull();
});

test("the section Space says in one sentence that the browser offers neither function", () => {
  show();
  const space = section("Space");
  expect(within(space).getByText(STORAGE_TEXTS.noSpace)).toBeDefined();
  expect(STORAGE_TEXTS.noSpace).toMatch(/^[A-Z][^.]*\.$/);
  expect(within(space).queryByRole("button", { name: "Ask the browser to keep the data" })).toBeNull();
});

test("the last section states what the browser and the server keep apart from the parts", () => {
  show();
  const last = section("Not kept by Lynkeus");
  for (const text of [STORAGE_TEXTS.signIn, STORAGE_TEXTS.cache, STORAGE_TEXTS.session]) {
    expect(within(last).getByText(text)).toBeDefined();
  }
  expect(STORAGE_TEXTS.signIn).toContain("the cookie lynkeus_session");
  expect(STORAGE_TEXTS.signIn).toContain("lasts 7 days from the last opening of the page");
  expect(STORAGE_TEXTS.signIn).toContain("The Earthdata user token is never stored in the browser.");
});

test("the cookie of the session has the name and the lifetime that the server gives it", () => {
  const sessions = readFileSync("../api/src/lynkeus/sessions.py", "utf8");
  const routes = readFileSync("../api/src/lynkeus/routes.py", "utf8");
  expect(sessions).toContain(`COOKIE = "${SESSION_COOKIE.name}"`);
  expect(sessions).toContain(`SESSION_IDLE_TIME = ${String(SESSION_COOKIE.days)} * 24 * 3600.0`);
  expect(routes).toContain("max_age=int(SESSION_IDLE_TIME),");
  // The cookie is given again whenever the page asks for the state of the session, which it does when it opens.
  expect(routes).toContain("request.state.session_key = request.cookies[COOKIE]");
  // The page cannot read the cookie, and the token of the sign-in stays in the memory of the server.
  expect(routes).toContain("httponly=True,");
  expect(sessions).toContain("The token is kept in the\nmemory of the server only");
});

test("when the browser refuses the storage, a notice says so and every switch is inactive with that reason", async () => {
  alpha.set("word");
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse, key: refuse, length: 0 });
  show();
  const notice = screen.getByText(STORAGE_TEXTS.refused);
  expect(notice.getAttribute("role")).toBe("status");
  for (const name of ["Keep my work in this browser", "Alpha", "Beta words"]) {
    expect(box(name).getAttribute("aria-disabled")).toBe("true");
    expect(box(name).disabled).toBe(false);
    expect(box(name).getAttribute("aria-describedby")?.split(" ")).toContain(notice.id);
  }
  await userEvent.click(box("Keep my work in this browser"));
  await userEvent.click(box("Alpha"));
  expect(box("Keep my work in this browser").checked).toBe(true);
  expect(box("Alpha").checked).toBe(true);
  expect(screen.getAllByText("Nothing stored")).toHaveLength(2);
  const clear = within(row("Alpha")).getByRole("button", { name: "Clear the stored alpha" });
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(clear.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
    STORAGE_TEXTS.noStorage,
  );
  expect(screen.getByRole("button", { name: "Clear all" }).getAttribute("aria-disabled")).toBe("true");
  // The page works without the storage.
  act(() => alpha.set("next"));
  expect(alpha.get()).toBe("next");
});
