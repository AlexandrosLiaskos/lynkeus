// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { layersOpenStore } from "../catalog/state";
import { jobsStore, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { resetSeries, seriesStore } from "../data/series";
import { resetSession, sessionStore, type Session } from "../data/session";
import { SIGN_IN_PANE } from "../data/SignInPane";
import { pairSeries, seriesItem } from "../data/testSeries";
import { job, layer } from "../data/testSession";
import { keeper, keptLayer, keptSeries, type Keeper } from "../data/testStorage";
import { resetLimits } from "../header/notice/limits";
import { SAMPLE } from "../header/notice/testLimits";
import { resetServers } from "../servers/requests";
import { SERVERS_PANE } from "../servers/state";
import { LABORATORY, NEW, OFFICE, OFFICE_NAME, SERVERS } from "../servers/testServers";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { keepInBrowser, OPTIONS_KEY, resetStorage, storageStore, type KeptPart } from "../shared/storage/storage";
import { createStore, type Store } from "../shared/store";
import { KEPT, statementOf } from "./kept";
import {
  cookieUntilWords,
  keepAllWords,
  serverRows,
  SESSION_COOKIE,
  STORAGE_PANE,
  STORAGE_TEXTS,
  StoragePane,
  tokenHeld,
  tokenUntilWords,
} from "./StoragePane";

const ALPHA = "lynkeus.test-alpha";
const BETA = "lynkeus.test-beta";
const SIGNED_IN: Session = { state: "signed-in", user: "a_user" };
const SIGNED_OUT: Session = { state: "signed-out" };

let alpha: Store<string>;
let beta: Store<string>;
let parts: KeptPart<string>[] = [];
let stand: Keeper;

// What the account keeps on the project server and on a server of the visitor, as the lists of the server state it.
const BACKSCATTER = keptLayer(
  {
    layer: layer({ id: "back", title: "Backscatter HH, 21 Oct 2026" }),
    size: 57_200_000,
    created: "2026-11-14T16:25:00Z",
  },
  "2026-11-28T16:25:00Z",
);
const COHERENCE = keptLayer(
  {
    layer: layer({ id: "coh", title: "Coherence HH, 9 and 21 Oct 2026" }),
    size: 12_800_000,
    created: "2026-11-10T09:00:00Z",
  },
  "2026-11-24T09:00:00Z",
);
const OWN = {
  layer: layer({ id: "own", title: "Backscatter VV, 21 Oct 2026", url: `/api/servers/${OFFICE.id}/files/own/vv.tif` }),
  size: 81_000_000,
  created: "2026-11-14T17:00:00Z",
  server: OFFICE_NAME,
};
const SERIES = keptSeries(seriesItem(), "2026-11-20T13:02:11Z");

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

/** Wait for the answers to the requests that are on their way. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
  });
}

/** Open the pane and wait for the answers to the requests that it sends when it opens. */
async function open(session: Session = SIGNED_OUT): Promise<HTMLElement> {
  sessionStore.set(session);
  render(<StoragePane />);
  act(() => openToolPane(STORAGE_PANE));
  await settle();
  return screen.getByRole("complementary", { name: "Storage" });
}

/** Open the pane for a visitor who is not signed in, with a server that states no limits, so that nothing arrives later. */
function show(): HTMLElement {
  stand.server.limits = null;
  sessionStore.set(SIGNED_OUT);
  render(<StoragePane />);
  act(() => openToolPane(STORAGE_PANE));
  return screen.getByRole("complementary", { name: "Storage" });
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

function section(title: string | RegExp): HTMLElement {
  const element = screen.getByRole("button", { name: title }).closest<HTMLElement>(".section");
  if (!element) {
    throw new Error(`The pane has no section ${String(title)}.`);
  }
  return element;
}

/** Return the row of something that is kept, by its title: its lines, and its element. */
function kept(title: string): { lines: string[]; element: HTMLElement } {
  const element = [...document.querySelectorAll<HTMLElement>(".storage-row")].find(
    (item) => item.querySelector(".item-title")?.textContent === title,
  );
  if (!element) {
    throw new Error(`The pane has no row ${title}.`);
  }
  return { lines: [...element.querySelectorAll(".item-line")].map((line) => line.textContent), element };
}

/** The rows of the lists of names and values of an element, each as its name and its value. */
function rowsOf(element: HTMLElement): string[] {
  return [...element.querySelectorAll(".property-row")].map(
    (item) =>
      `${item.querySelector(".property-name > span")?.textContent ?? ""}: ${item.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
}

const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

beforeEach(() => {
  resetDock();
  resetSession();
  resetJobs();
  resetLayers();
  resetSeries();
  resetServers();
  resetLimits();
  mapLayersStore.set([]);
  messagesStore.set([]);
  layersOpenStore.set(true);
  window.localStorage.clear();
  resetStorage();
  setManager(undefined);
  alpha = createStore("a");
  beta = createStore("b");
  word(ALPHA, "Alpha", alpha);
  word(BETA, "Beta words", beta);
  stand = keeper();
  stand.server.limits = SAMPLE;
  stand.server.servers = { servers: [], limit: SERVERS.limit };
});

afterEach(() => {
  parts.forEach((part) => part.leave());
  parts = [];
  resetServers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "storage");
});

test("the pane opens from its name, is not on the page before, and holds the four sections of docs/Storage.md", () => {
  stand.server.limits = null;
  render(<StoragePane />);
  expect(screen.queryByRole("complementary", { name: "Storage" })).toBeNull();
  act(() => openToolPane(STORAGE_PANE));
  const pane = screen.getByRole("complementary", { name: "Storage" });
  const titles = [...pane.querySelectorAll(".section-toggle")].map((title) => title.textContent);
  expect(titles.map((title) => title.replace(/ \(\d+\)$/, ""))).toEqual([
    "This browser",
    "Project server",
    "Your servers",
    "NASA and other services",
  ]);
  const document_ = readFileSync("../docs/Storage.md", "utf8");
  expect(document_).toContain("One pane, opened from Options > Storage, with four sections.");
  for (const title of ["This browser", "Project server", "Your servers", "NASA and other services"]) {
    expect(document_).toContain(`| ${title} | `);
  }
  // No notice says that the browser refuses the storage or that nothing is kept.
  expect(screen.queryByText(STORAGE_TEXTS.refused)).toBeNull();
  expect(screen.queryByText(STORAGE_TEXTS.off)).toBeNull();
});

test("the first section holds the main switch and a row for each part, with its explanation and its size", () => {
  alpha.set("word");
  show();
  expect(box("Keep my work in this browser").checked).toBe(true);
  const list = screen.getByRole("list", { name: "Parts of the work" });
  // The list holds a row for every part that is declared: the two of this test and those of the page.
  expect(within(list).getAllByRole("checkbox")).toHaveLength(storageStore.get().parts.length);
  expect(storageStore.get().parts.map(({ title }) => title)).toEqual(expect.arrayContaining(["Alpha", "Beta words"]));
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
  // The pane has no filled button: its buttons are outline buttons and links.
  expect(document.querySelector(".usa-button:not(.usa-button--outline):not(.usa-button--unstyled)")).toBeNull();
  expect(clear.getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(clear);
  expect(window.localStorage.getItem(ALPHA)).toBeNull();
  expect(window.localStorage.getItem(BETA)).toBeNull();
  expect([alpha.get(), beta.get()]).toEqual(["word", "other"]);
  expect(box("Alpha").checked).toBe(true);
  expect(screen.getAllByText("Nothing stored")).toHaveLength(storageStore.get().parts.length);
  expect(clear.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(clear.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
    STORAGE_TEXTS.nothingAtAll,
  );
});

test("the section This browser states the bytes used and allowed, and asks the browser to keep the data", async () => {
  const persist = vi.fn(() => Promise.resolve(true));
  setManager({
    estimate: () => Promise.resolve({ usage: 1234, quota: 5_000_000_000 }),
    persisted: () => Promise.resolve(false),
    persist,
  });
  show();
  const space = section("This browser");
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

test("the section This browser states the answer of a browser that does not agree to keep the data", async () => {
  setManager({
    estimate: () => Promise.resolve({}),
    persisted: () => Promise.resolve(false),
    persist: () => Promise.resolve(false),
  });
  show();
  const space = section("This browser");
  expect(await within(space).findAllByText("Not reported")).toHaveLength(2);
  await userEvent.click(await within(space).findByRole("button", { name: "Ask the browser to keep the data" }));
  expect(await within(space).findByText(STORAGE_TEXTS.declined)).toBeDefined();
  expect(within(space).getByRole("button", { name: "Ask the browser to keep the data" })).toBeDefined();
});

test("the section This browser says that the browser keeps the data when it already does", async () => {
  setManager({ persisted: () => Promise.resolve(true), persist: () => Promise.resolve(true) });
  show();
  const space = section("This browser");
  expect(await within(space).findByText(STORAGE_TEXTS.keeps)).toBeDefined();
  expect(within(space).queryByRole("button", { name: "Ask the browser to keep the data" })).toBeNull();
  expect(within(space).queryByText("Used by this site")).toBeNull();
});

test("the section This browser says in one sentence that the browser offers neither function", () => {
  show();
  const space = section("This browser");
  expect(within(space).getByText(STORAGE_TEXTS.noSpace)).toBeDefined();
  expect(STORAGE_TEXTS.noSpace).toMatch(/^[A-Z][^.]*\.$/);
  expect(within(space).queryByRole("button", { name: "Ask the browser to keep the data" })).toBeNull();
});

test("the pane and its explanations state every sentence of the table What is kept of docs/Storage.md", async () => {
  stand.server.layers = [BACKSCATTER];
  const pane = await open(SIGNED_IN);
  const text = pane.textContent;
  for (const sentence of Object.values(KEPT).flat()) {
    expect(text, sentence).toContain(sentence);
  }
  // The statement of a place stands behind the "i" of the section or of the row that shows the place.
  expect(within(section("This browser")).getByText(statementOf("browser"))).toBeDefined();
  expect(within(kept("Cookie of the session").element).getByText(statementOf("cookie"))).toBeDefined();
  expect(within(kept("Earthdata user token").element).getByText(statementOf("token"))).toBeDefined();
  expect(within(kept("Log of requests").element).getByText(statementOf("log"))).toBeDefined();
  expect(
    within(section("Project server")).getByText(`${statementOf("projectServer")} ${statementOf("files")}`),
  ).toBeDefined();
  expect(within(section(/^Your servers/)).getByText(statementOf("computer"))).toBeDefined();
});

test("the cookie of the session is said to be set only for a visitor who is signed in, with its time from the limits", async () => {
  await open();
  expect(kept("Cookie of the session").lines).toEqual(["Not set: you are not signed in to Earthdata"]);
  expect(within(kept("Cookie of the session").element).queryByRole("button", { name: "Sign out" })).toBeNull();
  act(() => sessionStore.set(SIGNED_IN));
  expect(kept("Cookie of the session").lines).toEqual([
    "Set, under the name lynkeus_session",
    "Until 14 days without use, or until you sign out",
  ]);
  await userEvent.click(within(kept("Cookie of the session").element).getByRole("button", { name: "Sign out" }));
  expect(stand.server.sent("DELETE", "/api/session/earthdata")).toHaveLength(1);
});

test("a time is said in the number of the limits, and in words while the limits are not known", () => {
  expect(cookieUntilWords(SAMPLE)).toBe("Until 14 days without use, or until you sign out");
  expect(cookieUntilWords(null)).toBe("Until the keeping time without use, or until you sign out");
  expect(tokenUntilWords(SAMPLE)).toBe("For 30 minutes without use, and 8 hours at the latest, or until you sign out");
  expect(tokenUntilWords(null)).toBe("For a limited time, or until you sign out");
  expect(keepAllWords(SAMPLE)).toBe(
    "Keeps every layer and series of your account on the project server for 14 days from now.",
  );
  expect(keepAllWords(null)).toBe(
    "Keeps every layer and series of your account on the project server for the keeping time from now.",
  );
});

test("no sentence of the pane types a duration or a size of what is kept", () => {
  // The numbers of the statements are those of docs/Storage.md, which a test compares with that document.
  for (const [name, sentence] of Object.entries(STORAGE_TEXTS)) {
    expect(sentence, name).not.toMatch(/\d/);
  }
  const source = readFileSync("src/options/StoragePane.tsx", "utf8");
  expect(source).not.toMatch(/\b\d+ (days?|hours?|minutes?|GB|MB|megabytes|gigabytes)\b/);
  expect(readFileSync("src/options/words.ts", "utf8")).not.toMatch(/\b\d+ (days?|hours?|minutes?|GB|MB)\b/);
});

test("the cookie of the session has the name that the server gives it, and the page cannot read it", () => {
  const sessions = readFileSync("../api/src/lynkeus/sessions.py", "utf8");
  const routes = readFileSync("../api/src/lynkeus/routes.py", "utf8");
  expect(sessions).toContain(`COOKIE = "${SESSION_COOKIE}"`);
  expect(routes).toContain("httponly=True,");
  expect(STORAGE_TEXTS.cookieSet).toContain(SESSION_COOKIE);
});

test("the cache of the browser is a row that says what the page cannot read or clear", async () => {
  await open();
  const cache = kept("Cache of the browser");
  expect(cache.lines).toEqual([STORAGE_TEXTS.cacheSize, STORAGE_TEXTS.cacheUntil]);
  expect(within(cache.element).getByText(STORAGE_TEXTS.cache)).toBeDefined();
  expect(cache.element.querySelector("button:not(.info-button)")).toBeNull();
});

test("not signed in, the section Project server says that nothing is kept for the visitor and leads to the sign-in", async () => {
  stand.server.layers = [BACKSCATTER];
  await open();
  const project = section("Project server");
  expect(within(project).getByText("Nothing kept for you")).toBeDefined();
  expect(within(project).getByText(STORAGE_TEXTS.signedOut)).toBeDefined();
  expect(project.querySelector('[role="meter"]')).toBeNull();
  expect(within(project).queryByRole("button", { name: "Keep all" })).toBeNull();
  // Nothing of an account is asked of the server.
  expect(stand.server.sent("GET", "/api/layers")).toEqual([]);
  expect(stand.server.sent("GET", "/api/servers")).toEqual([]);
  // The log is written for every visitor, so its row stays.
  expect(kept("Log of requests").lines).toEqual([STORAGE_TEXTS.log, STORAGE_TEXTS.logUntil]);
  expect(document.querySelectorAll(".storage-row .item-title")).toHaveLength(3);
  await userEvent.click(within(project).getByRole("button", { name: "Sign in" }));
  expect(dockStore.get().tools).toContain(SIGN_IN_PANE);
  expect(readFileSync("../docs/Storage.md", "utf8").replace(/\s+/g, " ")).toContain(
    "Not signed in, the section Project server says that nothing is kept for the visitor.",
  );
});

test("the section Project server says so while the sign-in is not known or the server does not answer", async () => {
  await open({ state: "unknown" });
  const project = section("Project server");
  expect(within(project).getByText(STORAGE_TEXTS.checking)).toBeDefined();
  expect(kept("Cookie of the session").lines).toEqual([STORAGE_TEXTS.cookieUnknown]);
  act(() => sessionStore.set({ state: "unreachable" }));
  expect(within(project).getByText(STORAGE_TEXTS.unreachable)).toBeDefined();
  expect(within(project).queryByText("Nothing kept for you")).toBeNull();
});

test("signed in, the section Project server states the account and what it keeps against its limits, as numbers and as bars", async () => {
  stand.server.layers = [BACKSCATTER, OWN, COHERENCE];
  stand.server.series = [SERIES];
  stand.server.jobs = [
    job({ jobID: "one", status: "running" }),
    job({ jobID: "two", status: "successful" }),
    job({ jobID: "away", status: "running", server: OFFICE_NAME }),
  ];
  await open(SIGNED_IN);
  const project = section("Project server");
  expect(rowsOf(project)).toEqual([
    "Earthdata account: a_user",
    'Next removal: 20 Nov 2026, 13:02:11 UTC: the series "Backscatter HH, mean of the area"',
  ]);
  // The layer of a server of the visitor does not count towards the limits of the project server.
  expect(kept("Layers").lines).toEqual(["2 of at most 50", STORAGE_TEXTS.untilDate]);
  expect(kept("Files of the layers").lines).toEqual(["70 MB of at most 2 GB"]);
  expect(kept("Series").lines).toEqual(["1 of at most 20", STORAGE_TEXTS.untilDate]);
  expect(kept("Jobs").lines).toEqual([
    "2 records, 1 of at most 4 waiting or running",
    "Until its layer or series is removed; a failed or cancelled job for 14 days",
  ]);
  const bars = within(project)
    .getAllByRole("meter")
    .map((bar) => [
      bar.getAttribute("aria-label"),
      bar.getAttribute("aria-valuenow"),
      bar.getAttribute("aria-valuemax"),
      bar.getAttribute("aria-valuetext"),
      bar.querySelector<HTMLElement>(".storage-bar-fill")?.style.width,
    ]);
  expect(bars).toEqual([
    ["Layers of the account", "2", "50", "2 of at most 50", "4.0%"],
    ["Size of the files of the layers", "70000000", "2000000000", "70 MB of at most 2 GB", "3.5%"],
    ["Series of the account", "1", "20", "1 of at most 20", "5.0%"],
  ]);
  expect(
    within(project).getByText(
      "A job is refused when it would leave less than 2 GB free on the disk of the server, so that the disk does not fill. At present 18 GB are free.",
    ),
  ).toBeDefined();
});

test("while the limits are not known the rows state the amounts alone, without a bar", async () => {
  stand.server.limits = null;
  stand.server.layers = [BACKSCATTER];
  await open(SIGNED_IN);
  expect(kept("Layers").lines[0]).toBe("1");
  expect(kept("Files of the layers").lines).toEqual(["57.2 MB"]);
  expect(kept("Jobs").lines).toEqual([
    "0 records, 0 waiting or running",
    "Until its layer or series is removed; a failed or cancelled job for the keeping time",
  ]);
  expect(document.querySelector('[role="meter"]')).toBeNull();
  expect(kept("Cookie of the session").lines[1]).toBe("Until the keeping time without use, or until you sign out");
});

test("a limit that is reached fills its bar, which then carries the mark of a full bar", async () => {
  stand.server.limits = { ...SAMPLE, limits: { ...SAMPLE.limits, account_layers: 1 } };
  stand.server.layers = [BACKSCATTER, COHERENCE];
  await open(SIGNED_IN);
  const bar = screen.getByRole("meter", { name: "Layers of the account" });
  expect(bar.className).toBe("storage-bar storage-bar--full");
  expect(bar.getAttribute("aria-valuenow")).toBe("1");
  expect(bar.querySelector<HTMLElement>(".storage-bar-fill")?.style.width).toBe("100.0%");
  expect(screen.getByRole("meter", { name: "Series of the account" }).className).toBe("storage-bar");
});

test("Keep all keeps every layer and series of the account for the keeping time from now", async () => {
  stand.server.layers = [BACKSCATTER, OWN];
  stand.server.series = [SERIES];
  await open(SIGNED_IN);
  const keep = screen.getByRole("button", { name: "Keep all" });
  expect(keep.className).toBe("usa-button usa-button--outline");
  expect(document.getElementById(keep.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
    keepAllWords(SAMPLE),
  );
  await userEvent.click(keep);
  expect(stand.server.sent("POST", "/api/storage/extension")).toHaveLength(1);
  await screen.findByText('1 Dec 2026, 10:00:00 UTC: the layer "Backscatter HH, 21 Oct 2026"');
  expect(layersStore.get().map((entry) => entry.keptUntil)).toEqual([stand.until, undefined]);
  expect(seriesStore.get().map((item) => item.kept_until)).toEqual([stand.until]);
  expect(messages()).toEqual([["info", "Every layer and series of your account is kept for 14 days from now."]]);
});

test("Keep all is inactive while the account keeps no layer and no series", async () => {
  await open(SIGNED_IN);
  const keep = screen.getByRole("button", { name: "Keep all" });
  expect(keep.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(keep.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
    STORAGE_TEXTS.keepAllNothing,
  );
  await userEvent.click(keep);
  expect(stand.server.sent("POST", "/api/storage/extension")).toEqual([]);
  expect(rowsOf(section("Project server"))[1]).toBe("Next removal: No layer or series states a date");
});

test("a Keep all that the server refuses is reported, and the dates stay", async () => {
  stand.server.layers = [BACKSCATTER];
  await open(SIGNED_IN);
  stand.refuse("POST", "/api/storage", 503, "The server is busy. Try again in a few minutes.");
  await userEvent.click(screen.getByRole("button", { name: "Keep all" }));
  await settle();
  expect(messages()).toEqual([["error", "The server is busy. Try again in a few minutes."]]);
  expect(layersStore.get()[0]?.keptUntil).toBe("2026-11-28T16:25:00Z");
});

test("Remove everything of mine asks first, names what goes and what stays, and removes only after the confirmation", async () => {
  stand.server.layers = [BACKSCATTER, OWN, COHERENCE];
  stand.server.series = [SERIES, keptSeries(seriesItem(pairSeries()), "2026-11-29T10:00:00Z")];
  stand.server.jobs = [job({ jobID: "one", status: "accepted" }), job({ jobID: "away", server: OFFICE_NAME })];
  await open(SIGNED_IN);
  act(() => {
    addToMap(BACKSCATTER.layer);
    addToMap(OWN.layer);
  });
  const remove = screen.getByRole("button", { name: "Remove everything of mine" });
  expect(remove.className).toBe("usa-button usa-button--outline");
  await userEvent.click(remove);
  const dialog = screen.getByRole("dialog", { name: "Remove everything of mine from the project server" });
  expect([...dialog.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual([
    "The project server ends your 1 waiting or running job and removes your 2 layers with their files, your 2 series and the records of your jobs. This cannot be undone.",
    "Your servers and their layers, the files that you downloaded and what this browser keeps stay as they are, and you stay signed in.",
  ]);
  // Cancel removes nothing.
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(stand.server.sent("DELETE", "/api/storage")).toEqual([]);
  expect(layersStore.get()).toHaveLength(3);
  await userEvent.click(remove);
  await userEvent.click(
    within(screen.getByRole("dialog", { name: "Remove everything of mine from the project server" })).getByRole(
      "button",
      { name: "Remove everything" },
    ),
  );
  await settle();
  expect(stand.server.sent("DELETE", "/api/storage")).toHaveLength(1);
  // The layer of the server of the visitor and its job stay, in the lists and on the map.
  expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["own"]);
  expect(seriesStore.get()).toEqual([]);
  expect(jobsStore.get().map((listed) => listed.jobID)).toEqual(["away"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["own"]);
  expect(messages()).toEqual([["info", STORAGE_TEXTS.removed]]);
  expect(kept("Layers").lines[0]).toBe("0 of at most 50");
  expect(screen.getByRole("button", { name: "Remove everything of mine" }).getAttribute("aria-disabled")).toBe("true");
});

test("a removal of everything that the server refuses is reported, and everything stays", async () => {
  stand.server.layers = [BACKSCATTER];
  await open(SIGNED_IN);
  stand.refuse("DELETE", "/api/storage", 503, "The server is busy. Try again in a few minutes.");
  await userEvent.click(screen.getByRole("button", { name: "Remove everything of mine" }));
  await userEvent.click(screen.getByRole("button", { name: "Remove everything" }));
  await settle();
  expect(messages()).toEqual([["error", "The server is busy. Try again in a few minutes."]]);
  expect(layersStore.get()).toHaveLength(1);
  expect(kept("Layers").lines[0]).toBe("1 of at most 50");
});

test("the link Show in the Catalog pane brings the Catalog pane to the front with its layers open", async () => {
  stand.server.layers = [BACKSCATTER];
  await open(SIGNED_IN);
  layersOpenStore.set(false);
  await userEvent.click(screen.getByRole("button", { name: "Show in the Catalog pane" }));
  expect(layersOpenStore.get()).toBe(true);
});

test("the row of the token states its times from the limits, and whether it is held where the server says so", async () => {
  await open(SIGNED_IN);
  expect(kept("Earthdata user token").lines).toEqual([
    "For 30 minutes without use, and 8 hours at the latest, or until you sign out",
  ]);
  expect(within(kept("Earthdata user token").element).getByRole("button", { name: "Sign out" })).toBeDefined();
  act(() => sessionStore.set({ ...SIGNED_IN, token: false } as Session));
  expect(kept("Earthdata user token").lines[0]).toBe(STORAGE_TEXTS.tokenNotHeld);
  // A visitor whose token is not held is signed in: the section still shows the account.
  expect(rowsOf(section("Project server"))[0]).toBe("Earthdata account: a_user");
  act(() => sessionStore.set({ ...SIGNED_IN, token: true } as Session));
  expect(kept("Earthdata user token").lines[0]).toBe(STORAGE_TEXTS.tokenHeld);
  expect(tokenHeld(SIGNED_IN)).toBeNull();
  expect(tokenHeld(SIGNED_OUT)).toBeNull();
  expect(tokenHeld({ ...SIGNED_IN, token: true } as Session)).toBe(true);
});

test("without a server the section Your servers says in one sentence what a server is for and leads to the pane Servers", async () => {
  await open(SIGNED_IN);
  const servers = section("Your servers (0)");
  expect(within(servers).getByText("No server connected")).toBeDefined();
  expect(within(servers).getByText(STORAGE_TEXTS.purpose)).toBeDefined();
  expect(STORAGE_TEXTS.purpose).toMatch(/^[A-Z][^.]*\.$/);
  expect(STORAGE_TEXTS.purpose).not.toMatch(/own server/);
  await userEvent.click(within(servers).getByRole("button", { name: "Open Servers" }));
  expect(dockStore.get().tools).toContain(SERVERS_PANE);
});

test("a visitor who is not signed in reads the same sentence, and no server is asked for", async () => {
  await open();
  const servers = section("Your servers");
  expect(within(servers).getByText(STORAGE_TEXTS.purpose)).toBeDefined();
  expect(within(servers).getByRole("button", { name: "Open Servers" })).toBeDefined();
  expect(stand.server.sent("GET", "/api/servers")).toEqual([]);
});

test("each server of the account shows its connection, its layers, its space as numbers and as a bar, and its folder", async () => {
  stand.server.servers = SERVERS;
  await open(SIGNED_IN);
  const servers = section("Your servers (3)");
  expect([...servers.querySelectorAll(".property-group-title")].map((title) => title.textContent)).toEqual([
    "Office computer",
    "Laboratory server",
    "DESKTOP-7Q2LM4K",
  ]);
  expect(rowsOf(servers).slice(0, 6)).toEqual([
    "Connection: Connected",
    "Layers kept: 6",
    "Space used by layers: 1.3 GB of at most 100 GB",
    "Free disk space: 412 GB",
    `Kept until: ${STORAGE_TEXTS.untilRemoved}`,
    "Folder of Lynkeus Server: %LOCALAPPDATA%\\Lynkeus",
  ]);
  expect(rowsOf(servers).slice(-2)).toEqual([
    "Connection: Not connected yet",
    `Layers and space: ${STORAGE_TEXTS.notReported}`,
  ]);
  const bars = within(servers).getAllByRole("meter");
  expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual([
    "Space used by the layers of Office computer",
    "Space used by the layers of Laboratory server",
  ]);
  // The layers of the second server use the space that its limit allows.
  expect(bars[1]?.className).toBe("storage-bar storage-bar--full");
  expect(within(servers).getByText("3 servers of yours keep the layers of the jobs that ran there.")).toBeDefined();
  expect(within(servers).getAllByRole("button", { name: "Copy Folder of Lynkeus Server" })).toHaveLength(2);
  await userEvent.click(within(servers).getByRole("button", { name: "Open Servers" }));
  expect(dockStore.get().tools).toContain(SERVERS_PANE);
});

test("the rows of a server name the folder of its system, and say so when the system is not known", () => {
  const folder = (server: typeof OFFICE) => serverRows(server).find(({ name }) => name === "Folder of Lynkeus Server");
  expect(folder(OFFICE)?.value).toBe("%LOCALAPPDATA%\\Lynkeus");
  expect(folder(LABORATORY)).toMatchObject({ value: "~/.local/share/lynkeus", copy: true });
  expect(folder(LABORATORY)?.info).toContain("$XDG_DATA_HOME/lynkeus");
  const state = OFFICE.state ? { ...OFFICE.state, system: "macOS 15.1" } : null;
  expect(folder({ ...OFFICE, state })?.value).toBe("~/Library/Application Support/Lynkeus");
  const unnamed = OFFICE.state ? { ...OFFICE.state, system: "Unknown system" } : null;
  expect(folder({ ...OFFICE, state: unnamed })).toMatchObject({ value: STORAGE_TEXTS.noSystem });
  expect(serverRows(NEW).map(({ name }) => name)).toEqual(["Connection", "Layers and space"]);
});

test("the section NASA and other services says what each service outside Lynkeus receives", async () => {
  await open();
  const services = section("NASA and other services");
  expect(rowsOf(services)).toEqual([
    `NASA Harmony: ${KEPT.nasa[0]}`,
    `NASA's catalogue: ${KEPT.nasa[1]}`,
    `Basemaps: ${KEPT.nasa[2]}`,
    `GitHub: ${STORAGE_TEXTS.github}`,
  ]);
  expect(within(services).getByText(STORAGE_TEXTS.services)).toBeDefined();
});

test("the services that the section names are the ones that the page may reach, as the web server allows them", () => {
  const settings = readFileSync("nginx.conf", "utf8");
  const policy = /add_header Content-Security-Policy "(default-src 'self';[^"]*)" always;/.exec(settings)?.[1] ?? "";
  const hosts = [...policy.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((match) => match[1]).sort();
  expect(hosts).toEqual(["api.github.com", "gibs.earthdata.nasa.gov", "tile.openstreetmap.org"]);
  expect(KEPT.nasa[2]).toContain("NASA GIBS and OpenStreetMap");
  expect(STORAGE_TEXTS.github.startsWith("GitHub receives ")).toBe(true);
  // The request to GitHub is the one of the pane Servers for the latest release of Lynkeus Server.
  expect(readFileSync("src/servers/downloads.ts", "utf8")).toContain(
    "return `https://api.github.com/repos/${repository}/releases/latest`;",
  );
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
  expect(screen.getAllByText("Nothing stored")).toHaveLength(storageStore.get().parts.length);
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
