// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { againStore, getAgain, resetAgain } from "../data/again";
import { jobsReadStore, jobsStore, resetJobs } from "../data/jobs";
import { layersFaultStore, layersReadStore, layersStore, resetLayers, type LayerSource } from "../data/layers";
import { accountOf, resetSession, sessionStore, type Session } from "../data/session";
import { job, standIn } from "../data/testSession";
import { LABORATORY, OFFICE, SERVERS } from "../servers/testServers";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { serversStore } from "../shared/servers";
import { setLayerOrder } from "../shared/shapeLayers";
import { problemOfAnswer } from "./fileProblem";
import {
  fileGone,
  forgetKept,
  isOnMap,
  keptStore,
  LAYER_STATES,
  LONGEST_RETRY_TIME,
  reconcile,
  resetKept,
  restoreKept,
  RETRY_TIME,
  STATE_NAMES,
  stateOf,
  statesStore,
  watchKept,
  type KeptLayer,
  type World,
} from "./kept";
import {
  idsIn,
  inputWords,
  noAnswerWords,
  removedCommand,
  removedWords,
  STATE_COMMANDS,
  toolWords,
  waitingGroups,
  waitsWords,
} from "./keptWords";
import { displayStore, setDisplay, type LayerDisplay } from "./state";

function described(id: string, title: string, change: Partial<LayerDescription> = {}): LayerDescription {
  return {
    id,
    title,
    kind: "layer",
    url: `/files/${id}/${id}.tif`,
    quantity: "Radar backscatter gamma nought, HH, linear power",
    unit: "1",
    range: [0, 1],
    colours: "grey",
    dates: ["2026-10-21"],
    inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}/${id}.json`,
    ...change,
  };
}

const ONE = described("one", "Backscatter HH, 21 Oct 2026");
const TWO = described("two", "Backscatter HH, 2 Nov 2026", { dates: ["2026-11-02"] });
const THREE = described("three", "Backscatter HV, 21 Oct 2026");
/** A result of an analysis tool, made from the first two layers. */
const CHANGE = described("change", "Backscatter change", {
  kind: "result",
  method: "docs/methods/backscatter-change.md",
  dates: ["2026-10-21", "2026-11-02"],
  inputs: ["first.h5", "second.h5"],
});
/** A layer that a server of the visitor keeps: the connected one, and the one that is not connected. */
const AT_OFFICE = described("office", "Coherence at the office", {
  url: `/api/servers/${OFFICE.id}/files/office/office.tif`,
});
const AT_LABORATORY = described("laboratory", "Coherence at the laboratory", {
  url: `/api/servers/${LABORATORY.id}/files/laboratory/laboratory.tif`,
});

/** The request that made a received layer, and the one that made the result. */
const REQUEST: LayerSource = {
  process: "get-layer",
  inputs: {
    product: "GCOV",
    granule: "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001",
    layer: "HHHH",
    area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
  },
};
const TOOL_RUN: LayerSource = {
  process: "backscatter-change",
  inputs: { inputs: ["one", "two"], title: "Backscatter change" },
};

const DISPLAY: LayerDisplay = { visible: true, opacity: 0.4, range: [0.1, 0.5], colours: "viridis" };

const A_USER: Session = { state: "signed-in", user: "a_user", token: true };
const B_USER: Session = { state: "signed-in", user: "b_user", token: true };
const SIGNED_OUT: Session = { state: "signed-out" };

/** Give the page the list of layers of the server, as a reading under the sign-in of this moment gives it. */
function list(layers: readonly LayerDescription[], sources: Readonly<Record<string, LayerSource>> = {}): void {
  layersStore.set(
    layers.map((layer) => {
      const source = sources[layer.id];
      return { layer, size: null, created: null, server: null, ...(source ? { source } : {}) };
    }),
  );
  layersReadStore.set({ account: accountOf() });
}

/** Bring layers into the page as the browser stored them for an account. */
function stored(
  layers: readonly LayerDescription[],
  account: string | null = "a_user",
  sources: Readonly<Record<string, LayerSource>> = {},
  displays: Readonly<Record<string, LayerDisplay>> = {},
): void {
  restoreKept(
    layers.map((layer) => {
      const display = displays[layer.id];
      return { layer, account, source: sources[layer.id] ?? null, ...(display ? { display } : {}) };
    }),
  );
}

const drawn = () => mapLayersStore.get().map(({ id }) => id);
const keptIds = () => keptStore.get().map(({ layer }) => layer.id);
const entryOf = (id: string): KeptLayer => {
  const entry = keptStore.get().find(({ layer }) => layer.id === id);
  if (!entry) {
    throw new Error(`The browser keeps no layer ${id}.`);
  }
  return entry;
};
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

function reset(): void {
  resetKept();
  mapLayersStore.set([]);
  displayStore.set({});
  resetSession();
  resetLayers();
  resetJobs();
  resetAgain();
  serversStore.set(null);
  resetKept();
  messagesStore.set([]);
}

beforeEach(reset);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the state of one layer", () => {
  const WORLD: World = { session: A_USER, listed: new Set(["one"]), failed: false, away: new Set([LABORATORY.id]) };
  const of = (layer: LayerDescription, account: string | null, change: Partial<World> = {}) =>
    stateOf({ layer, account }, { ...WORLD, ...change });

  test("the names of the states are those of the table of docs/Storage.md", () => {
    const rule = readFileSync(resolve(import.meta.dirname, "../../../docs/Storage.md"), "utf8");
    const table = rule.slice(
      rule.indexOf("## States of a stored layer"),
      rule.indexOf("Further rules of the interface"),
    );
    const names = [...table.matchAll(/^\| ([A-Z][^|]+) \|/gm)].map((row) => row[1]?.trim());
    expect(names).toEqual(["State", ...LAYER_STATES.map((state) => STATE_NAMES[state])]);
  });

  test("a layer of the list of the account of the sign-in is ready, with or without the token", () => {
    expect(of(ONE, "a_user")).toBe("ready");
    expect(of(ONE, "a_user", { session: { state: "signed-in", user: "a_user", token: false } })).toBe("ready");
  });

  test("a layer waits for the sign-in while nobody or another account is signed in", () => {
    expect(of(ONE, "a_user", { session: SIGNED_OUT })).toBe("waits");
    expect(of(ONE, "a_user", { session: B_USER })).toBe("waits");
    // The list of the other account says nothing about a layer of this one.
    expect(of(TWO, "a_user", { session: B_USER })).toBe("waits");
  });

  test("a layer that the list of its account does not hold was removed from the server", () => {
    expect(of(TWO, "a_user")).toBe("removed");
    expect(of(AT_OFFICE, "a_user")).toBe("removed");
  });

  test("a listed layer of a server of the visitor that is not connected says so", () => {
    const listed = new Set(["office", "laboratory"]);
    expect(of(AT_LABORATORY, "a_user", { listed })).toBe("not-connected");
    expect(of(AT_OFFICE, "a_user", { listed })).toBe("ready");
  });

  test("without an answer of the project server the state is no answer", () => {
    expect(of(ONE, "a_user", { session: { state: "unreachable" } })).toBe("no-answer");
    expect(of(ONE, "a_user", { listed: null, failed: true })).toBe("no-answer");
  });

  test("the state is not known before the first answers", () => {
    expect(of(ONE, "a_user", { session: { state: "unknown" } })).toBeNull();
    expect(of(ONE, "a_user", { listed: null })).toBeNull();
  });

  test("a layer that was stored without its account counts as a layer of the sign-in", () => {
    expect(of(ONE, null)).toBe("ready");
    expect(of(TWO, null)).toBe("removed");
    expect(of(ONE, null, { session: SIGNED_OUT })).toBe("waits");
  });

  test("only a layer that is ready or whose server is not connected is put on the map", () => {
    expect(LAYER_STATES.filter(isOnMap)).toEqual(["ready", "not-connected"]);
  });
});

/**
 * The cases of the task, each with the state in which it ends, the sentence that the Contents pane shows and its
 * one command. The table of docs/research/storage-interface.md lists the same rows, and a test compares the two.
 */
interface Case {
  name: string;
  /** The id of the layer that the case is about. */
  id: string;
  arrange: () => void;
  state: string;
  says: string;
  command: string;
}

const NOT_KNOWN = "Not known yet";
const DRAWN = "Nothing: the layer is drawn.";
const NOTHING = "Nothing: the layer is not drawn, and nothing is said until the first answers arrive.";

const CASES: Case[] = [
  {
    name: "The visitor is signed in to the account of the layer, and the list of the server holds the layer.",
    id: "one",
    arrange: () => {
      sessionStore.set(A_USER);
      list([ONE, TWO]);
      stored([ONE, TWO]);
    },
    state: "Ready",
    says: DRAWN,
    command: "None",
  },
  {
    name: "The visitor is signed in and the server no longer holds the token.",
    id: "one",
    arrange: () => {
      sessionStore.set({ state: "signed-in", user: "a_user", token: false });
      list([ONE, TWO]);
      stored([ONE, TWO]);
    },
    state: "Ready",
    says: DRAWN,
    command: "None",
  },
  {
    name: "The visitor comes back after the session has ended, or has signed out: the browser has kept two layers and nobody is signed in.",
    id: "one",
    arrange: () => {
      sessionStore.set(SIGNED_OUT);
      list([]);
      stored([ONE, TWO]);
    },
    state: "Waits for the sign-in",
    says: "2 layers of this map belong to the Earthdata account a_user and are not shown. Sign in to that account to show them again.",
    command: "Sign in",
  },
  {
    name: "The visitor is signed in to another account than the one of the two kept layers.",
    id: "one",
    arrange: () => {
      sessionStore.set(B_USER);
      list([THREE]);
      stored([ONE, TWO]);
    },
    state: "Waits for the sign-in",
    says: "2 layers of this map belong to the Earthdata account a_user, and you are signed in as b_user. They are shown again after a sign-in as a_user.",
    command: "Remove from this browser",
  },
  {
    name: "The map was stored in the older form, without accounts, and nobody is signed in.",
    id: "one",
    arrange: () => {
      sessionStore.set(SIGNED_OUT);
      list([]);
      stored([ONE], null);
    },
    state: "Waits for the sign-in",
    says: "1 layer of this map was stored without the name of its Earthdata account and is not shown. Sign in to Earthdata to show it again.",
    command: "Sign in",
  },
  {
    name: "The map was stored in the older form, without accounts, and the list of the account of the sign-in holds the layer.",
    id: "one",
    arrange: () => {
      sessionStore.set(A_USER);
      list([ONE]);
      stored([ONE], null);
    },
    state: "Ready",
    says: DRAWN,
    command: "None",
  },
  {
    name: "The list of the server does not hold a received layer whose request the browser has kept.",
    id: "one",
    arrange: () => {
      sessionStore.set(A_USER);
      list([TWO]);
      stored([ONE, TWO], "a_user", { one: REQUEST });
    },
    state: "Removed from the server",
    says: "The project server no longer keeps this layer: it removed the layer after the keeping time, or the layer was removed elsewhere. Get again requests it from NASA with the same choices and gives it this place.",
    command: "Get again",
  },
  {
    name: "The list of the server does not hold a received layer whose request is not known.",
    id: "one",
    arrange: () => {
      sessionStore.set(A_USER);
      list([TWO]);
      stored([ONE, TWO]);
    },
    state: "Removed from the server",
    says: "The project server no longer keeps this layer: it removed the layer after the keeping time, or the layer was removed elsewhere. Request it again with Get layer, in the Data tab.",
    command: "Remove from the map",
  },
  {
    name: "The list of the server does not hold a result, and holds its two input layers.",
    id: "change",
    arrange: () => {
      sessionStore.set(A_USER);
      list([ONE, TWO]);
      stored([ONE, TWO, CHANGE], "a_user", { change: TOOL_RUN });
    },
    state: "Removed from the server",
    says: 'The project server no longer keeps this result: it removed the result after the keeping time, or the result was removed elsewhere. The tool Backscatter, Change made it from the layers "Backscatter HH, 21 Oct 2026" and "Backscatter HH, 2 Nov 2026".',
    command: "Remove from the map",
  },
  {
    name: "The list of the server holds neither a result nor its input layers.",
    id: "change",
    arrange: () => {
      sessionStore.set(A_USER);
      list([]);
      stored([CHANGE], "a_user", { change: TOOL_RUN });
    },
    state: "Removed from the server",
    says: "The project server no longer keeps this result: it removed the result after the keeping time, or the result was removed elsewhere. The tool Backscatter, Change made it from the product files first.h5 and second.h5.",
    command: "Remove from the map",
  },
  {
    name: "A removed layer was requested again with Get again, and its job runs.",
    id: "one",
    arrange: () => {
      sessionStore.set(A_USER);
      list([]);
      stored([ONE], "a_user", { one: REQUEST });
      jobsStore.set([job({ jobID: "again", status: "running" })]);
      jobsReadStore.set({ account: "a_user" });
      againStore.set({ one: "again" });
    },
    state: "Removed from the server",
    says: "This layer was requested again, and its job is running. The new layer takes this place when the job ends.",
    command: "None",
  },
  {
    name: "The list of the server does not hold a layer that a server of the visitor kept.",
    id: "office",
    arrange: () => {
      sessionStore.set(A_USER);
      serversStore.set(SERVERS);
      list([]);
      stored([AT_OFFICE], "a_user", { office: REQUEST });
    },
    state: "Removed from the server",
    says: `Your server "${OFFICE.name}" no longer keeps this layer: the layer was removed elsewhere. Get again requests it from NASA with the same choices and gives it this place.`,
    command: "Get again",
  },
  {
    name: "A server of the visitor that is not connected keeps the layer.",
    id: "laboratory",
    arrange: () => {
      sessionStore.set(A_USER);
      serversStore.set(SERVERS);
      list([AT_LABORATORY]);
      stored([AT_LABORATORY]);
    },
    state: "Server not connected",
    says: `Your server "${LABORATORY.name}", which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again.`,
    command: "Try again",
  },
  {
    name: "The project server does not answer about the sign-in.",
    id: "one",
    arrange: () => {
      sessionStore.set({ state: "unreachable" });
      stored([ONE, TWO]);
    },
    state: "No answer",
    says: "The project server does not answer, so 2 layers of this map are not shown. The page asks again by itself.",
    command: "None",
  },
  {
    name: "The visitor is signed in, and the project server does not answer about the list of layers.",
    id: "one",
    arrange: () => {
      sessionStore.set(A_USER);
      layersFaultStore.set("The server of Lynkeus did not answer. Check the connection and try again.");
      stored([ONE]);
    },
    state: "No answer",
    says: "The project server does not answer, so 1 layer of this map is not shown. The page asks again by itself.",
    command: "None",
  },
  {
    name: "The page has opened, and the project server has not yet answered about the sign-in or about the list.",
    id: "one",
    arrange: () => {
      stored([ONE]);
    },
    state: NOT_KNOWN,
    says: NOTHING,
    command: "None",
  },
];

/** Return what the Contents pane says about a kept layer in its state, and the command that it offers. */
function shown(id: string): { state: string; says: string; command: string } {
  const state = statesStore.get()[id];
  const kept = keptStore.get();
  const entry = entryOf(id);
  const user = accountOf();
  if (state === undefined) {
    return { state: NOT_KNOWN, says: NOTHING, command: "None" };
  }
  const name = STATE_NAMES[state];
  switch (state) {
    case "ready":
      return { state: name, says: DRAWN, command: "None" };
    case "waits": {
      const group = waitingGroups(kept, statesStore.get()).find(({ ids }) => ids.includes(id));
      return {
        state: name,
        says: waitsWords(group?.ids.length ?? 0, entry.account, user),
        command: user === null ? STATE_COMMANDS.signIn : STATE_COMMANDS.removeFromBrowser,
      };
    }
    case "removed": {
      const running = jobsStore.get().find((other) => other.jobID === againStore.get()[id]) ?? null;
      const keeper = /^\/api\/servers\/([0-9a-f]+)\//.exec(entry.layer.url)?.[1];
      const server =
        keeper === undefined ? null : (serversStore.get()?.servers.find((other) => other.id === keeper)?.name ?? "");
      const known = [...layersStore.get().map((other) => other.layer), ...kept.map((other) => other.layer)];
      const command = removedCommand(entry, running);
      return {
        state: name,
        says: removedWords(entry, { server, job: running, known }),
        command: command === null ? "None" : STATE_COMMANDS[command],
      };
    }
    case "not-connected":
      return { state: name, says: problemOfAnswer(entry.layer.url, 503, null)?.text ?? "", command: "Try again" };
    case "no-answer":
      return { state: name, says: noAnswerWords(idsIn(kept, statesStore.get(), "no-answer").length), command: "None" };
  }
}

describe("the cases of docs/research/storage-interface.md", () => {
  test.each(CASES)("$name", ({ id, arrange, state, says, command }) => {
    arrange();
    expect(shown(id)).toEqual({ state, says, command });
    // A layer is never drawn in a state other than Ready; a layer whose server is not connected keeps its row.
    expect(drawn().includes(id)).toBe(state === "Ready" || state === "Server not connected");
    // No state is shown as an error message of the map.
    expect(messages()).toEqual([]);
  });

  test("the table of the research note lists the same cases, states, sentences and commands", () => {
    const note = readFileSync(resolve(import.meta.dirname, "../../../docs/research/storage-interface.md"), "utf8");
    const start = note.indexOf("## Cases of a stored layer");
    const table = note.slice(start, note.indexOf("\n## ", start + 1));
    const rows = table
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Case") && !line.startsWith("|---"))
      .map((line) =>
        line
          .slice(2, -2)
          .split(" | ")
          .map((cell) => cell.trim()),
      );
    expect(rows).toEqual(CASES.map(({ name, state, says, command }) => [name, state, says, command]));
  });
});

describe("the layers that wait for the sign-in", () => {
  test("after a sign-out no layer of the account is drawn, and the browser keeps them with their displays", () => {
    sessionStore.set(A_USER);
    list([ONE, TWO, THREE]);
    [ONE, TWO, THREE].forEach(addToMap);
    setDisplay(TWO, { opacity: 0.4, colours: "viridis" });
    expect(drawn()).toEqual(["one", "two", "three"]);
    expect(entryOf("two")).toMatchObject({ account: "a_user", aside: false });

    sessionStore.set(SIGNED_OUT);
    expect(drawn()).toEqual([]);
    expect(keptIds()).toEqual(["one", "two", "three"]);
    expect(statesStore.get()).toEqual({ one: "waits", two: "waits", three: "waits" });
    expect(entryOf("two").display).toMatchObject({ opacity: 0.4, colours: "viridis" });
    expect(messages()).toEqual([]);
  });

  test("after the sign-in to their account the layers are back in their order, each with its display", () => {
    sessionStore.set(SIGNED_OUT);
    list([]);
    stored([ONE, TWO, THREE], "a_user", {}, { two: DISPLAY });
    expect(drawn()).toEqual([]);

    // The sign-in changes the account. Until the list of the new account arrives the layers stay as they are.
    sessionStore.set(A_USER);
    layersReadStore.set(null);
    expect(drawn()).toEqual([]);
    expect(statesStore.get()).toEqual({});

    list([THREE, TWO, ONE]);
    expect(drawn()).toEqual(["one", "two", "three"]);
    expect(displayStore.get()).toEqual({ two: DISPLAY });
    expect(statesStore.get()).toEqual({ one: "ready", two: "ready", three: "ready" });
    expect(keptStore.get().every((entry) => !entry.aside && entry.display === undefined)).toBe(true);
  });

  test("the layers of two accounts wait in two groups, and those of the account of the sign-in are drawn", () => {
    sessionStore.set(B_USER);
    list([THREE]);
    restoreKept([
      { layer: ONE, account: "a_user", source: null },
      { layer: THREE, account: "b_user", source: null },
      { layer: TWO, account: "a_user", source: null },
    ]);
    expect(drawn()).toEqual(["three"]);
    expect(waitingGroups(keptStore.get(), statesStore.get())).toEqual([{ account: "a_user", ids: ["one", "two"] }]);
    sessionStore.set(SIGNED_OUT);
    expect(waitingGroups(keptStore.get(), statesStore.get())).toEqual([
      { account: "a_user", ids: ["one", "two"] },
      { account: "b_user", ids: ["three"] },
    ]);
  });

  test("the layers of another account are removed from this browser on request, and the others stay", () => {
    sessionStore.set(B_USER);
    list([THREE]);
    restoreKept([
      { layer: ONE, account: "a_user", source: null },
      { layer: THREE, account: "b_user", source: null },
      { layer: TWO, account: "a_user", source: null },
    ]);
    forgetKept(["one", "two"]);
    expect(keptIds()).toEqual(["three"]);
    expect(drawn()).toEqual(["three"]);
    expect(statesStore.get()).toEqual({ three: "ready" });
  });

  test("a layer that is on the map is not taken out of the browser as a layer that is set aside", () => {
    sessionStore.set(A_USER);
    list([ONE]);
    stored([ONE]);
    forgetKept(["one"]);
    expect(keptIds()).toEqual(["one"]);
    forgetKept();
    expect(keptIds()).toEqual([]);
    expect(drawn()).toEqual([]);
  });

  test("the sentences name the account and the number of the layers", () => {
    expect(waitsWords(1, "a_user", null)).toBe(
      "1 layer of this map belongs to the Earthdata account a_user and is not shown. Sign in to that account to show it again.",
    );
    expect(waitsWords(1, "a_user", "b_user")).toBe(
      "1 layer of this map belongs to the Earthdata account a_user, and you are signed in as b_user. It is shown again after a sign-in as a_user.",
    );
    expect(waitsWords(3, null, null)).toBe(
      "3 layers of this map were stored without the name of their Earthdata account and are not shown. Sign in to Earthdata to show them again.",
    );
  });
});

describe("the layers of the map and the kept layers", () => {
  test("a layer that is added to the map is kept for the account of the sign-in, with the request that made it", () => {
    sessionStore.set(A_USER);
    list([ONE, TWO], { one: REQUEST });
    addToMap(ONE);
    expect(keptStore.get()).toEqual([{ layer: ONE, account: "a_user", source: REQUEST, aside: false }]);
    // A request that the list states later is taken then.
    addToMap(TWO);
    expect(entryOf("two").source).toBeNull();
    list([ONE, TWO], { one: REQUEST, two: REQUEST });
    expect(entryOf("two").source).toEqual(REQUEST);
  });

  test("a layer that was stored without its account takes the account of the sign-in when its list holds it", () => {
    sessionStore.set(A_USER);
    list([ONE], { one: REQUEST });
    stored([ONE], null);
    expect(entryOf("one")).toEqual({ layer: ONE, account: "a_user", source: REQUEST, aside: false });
  });

  test("a layer that is taken off the map leaves the kept layers", () => {
    sessionStore.set(A_USER);
    list([ONE, TWO]);
    [ONE, TWO].forEach(addToMap);
    removeFromMap("one");
    expect(keptIds()).toEqual(["two"]);
  });

  test("the layers that are set aside keep their places while the layers of the map are moved", () => {
    sessionStore.set(A_USER);
    list([ONE, THREE]);
    stored([ONE, TWO, THREE], "a_user", { two: REQUEST });
    expect(drawn()).toEqual(["one", "three"]);
    expect(statesStore.get().two).toBe("removed");
    setLayerOrder(["three", "one"]);
    expect(drawn()).toEqual(["three", "one"]);
    expect(keptIds()).toEqual(["three", "two", "one"]);
    // A new layer goes on top.
    list([ONE, THREE, CHANGE]);
    addToMap(CHANGE);
    expect(keptIds()).toEqual(["three", "two", "one", "change"]);
  });

  test("a layer that is on the map keeps its place while the list of another sign-in is on its way", () => {
    sessionStore.set(A_USER);
    list([ONE]);
    addToMap(ONE);
    layersReadStore.set(null);
    reconcile();
    expect(drawn()).toEqual(["one"]);
    expect(statesStore.get()).toEqual({});
  });

  test("a map that another window has stored takes the place of the layers of this page", () => {
    sessionStore.set(A_USER);
    list([ONE, TWO, THREE]);
    [ONE, TWO].forEach(addToMap);
    setDisplay(ONE, { opacity: 0.2 });
    stored([THREE, ONE], "a_user", {}, { three: DISPLAY });
    expect(drawn()).toEqual(["three", "one"]);
    expect(keptIds()).toEqual(["three", "one"]);
    // The display of the other window is the display of the shared map.
    expect(displayStore.get()).toEqual({ three: DISPLAY });
  });
});

describe("a layer that the server removed", () => {
  test("a restored layer whose file is gone is not drawn, has the state removed and states no error", () => {
    sessionStore.set(A_USER);
    list([TWO]);
    stored([ONE, TWO], "a_user", { one: REQUEST }, { one: DISPLAY });
    expect(drawn()).toEqual(["two"]);
    expect(statesStore.get()).toEqual({ one: "removed", two: "ready" });
    expect(entryOf("one")).toEqual({ layer: ONE, account: "a_user", source: REQUEST, aside: true, display: DISPLAY });
    expect(displayStore.get()).toEqual({});
    expect(messages()).toEqual([]);
  });

  test("a layer that passes its date while the page is open leaves the map without an error message", () => {
    sessionStore.set(A_USER);
    list([ONE, TWO], { one: REQUEST });
    [ONE, TWO].forEach(addToMap);
    setDisplay(ONE, { opacity: 0.4 });
    // The removal run of the server takes the layer, and the next reading of the list no longer holds it.
    list([TWO]);
    expect(drawn()).toEqual(["two"]);
    expect(statesStore.get()).toEqual({ one: "removed", two: "ready" });
    expect(entryOf("one")).toMatchObject({ aside: true, source: REQUEST, display: { opacity: 0.4 } });
    expect(messages()).toEqual([]);
  });

  test("a file that no longer exists is taken to the list of the server", async () => {
    const server = standIn();
    sessionStore.set(A_USER);
    list([ONE, TWO]);
    [ONE, TWO].forEach(addToMap);
    server.layers = [{ layer: TWO }];
    await expect(fileGone("one")).resolves.toBe(true);
    expect(server.sent("GET", "/api/layers")).toHaveLength(1);
    expect(drawn()).toEqual(["two"]);
    // A layer that the list still holds states the problem of its file, as before.
    await expect(fileGone("two")).resolves.toBe(false);
    expect(drawn()).toEqual(["two"]);
  });

  test("Remove from the map takes the layer out of the browser", () => {
    sessionStore.set(A_USER);
    list([TWO]);
    stored([ONE, TWO], "a_user", { one: REQUEST });
    againStore.set({ one: "again" });
    forgetKept(["one"]);
    expect(keptIds()).toEqual(["two"]);
    expect(statesStore.get()).toEqual({ two: "ready" });
    expect(againStore.get()).toEqual({});
  });

  test("Get again sends the request that made the layer, on the project server", async () => {
    const server = standIn();
    sessionStore.set(A_USER);
    list([TWO]);
    stored([ONE, TWO], "a_user", { one: REQUEST });
    const started = await getAgain("one", REQUEST, ONE.url);
    expect(server.sent("POST")).toEqual([
      { method: "POST", address: "/api/processes/get-layer/execution", content: { inputs: REQUEST.inputs } },
    ]);
    expect(againStore.get()).toEqual({ one: started.jobID });
    // The row stays, and the layer is not drawn while the job waits.
    expect(statesStore.get().one).toBe("removed");
    expect(drawn()).toEqual(["two"]);
  });

  test("Get again of a layer of a server of the visitor names that server, and otherwise the project server", async () => {
    const server = standIn();
    serversStore.set(SERVERS);
    sessionStore.set(A_USER);
    await getAgain("office", REQUEST, AT_OFFICE.url);
    await getAgain("one", REQUEST, ONE.url);
    expect(server.sent("POST").map(({ address }) => address)).toEqual([
      `/api/processes/get-layer/execution?server=${OFFICE.id}`,
      "/api/processes/get-layer/execution?server=project",
    ]);
  });

  test("the new layer takes the place, the order and the display of the removed one", () => {
    const again = described("one-again", "Backscatter HH, 21 Oct 2026");
    sessionStore.set(A_USER);
    list([TWO, THREE]);
    stored([TWO, ONE, THREE], "a_user", { one: REQUEST }, { one: DISPLAY });
    jobsStore.set([job({ jobID: "again", status: "running" })]);
    jobsReadStore.set({ account: "a_user" });
    againStore.set({ one: "again" });
    expect(drawn()).toEqual(["two", "three"]);

    // The job ends: the page reads the list, and puts the new layer on the map, above the others.
    list([again, TWO, THREE], { "one-again": REQUEST });
    jobsStore.set([job({ jobID: "again", status: "successful", layer: "one-again" })]);
    addToMap(again);

    expect(drawn()).toEqual(["two", "one-again", "three"]);
    expect(keptIds()).toEqual(["two", "one-again", "three"]);
    expect(displayStore.get()).toEqual({ "one-again": DISPLAY });
    expect(entryOf("one-again")).toEqual({ layer: again, account: "a_user", source: REQUEST, aside: false });
    expect(againStore.get()).toEqual({});
    expect(statesStore.get()).toEqual({ two: "ready", "one-again": "ready", three: "ready" });
  });

  test("the new layer takes the place also when its job ended while the page was closed", () => {
    const again = described("one-again", "Backscatter HH, 21 Oct 2026");
    // The page opens: the browser has stored the map with the removed layer and the job of Get again.
    stored([TWO, ONE, THREE], "a_user", { one: REQUEST }, { one: DISPLAY });
    againStore.set({ one: "again" });
    expect(drawn()).toEqual([]);
    // The answers of the server arrive: the sign-in, the jobs and the list.
    sessionStore.set(A_USER);
    jobsStore.set([job({ jobID: "again", status: "successful", layer: "one-again" })]);
    jobsReadStore.set({ account: "a_user" });
    list([again, TWO, THREE]);
    expect(drawn()).toEqual(["two", "one-again", "three"]);
    expect(displayStore.get()).toEqual({ "one-again": DISPLAY });
    expect(againStore.get()).toEqual({});
  });

  test("a job of Get again that ended before the list held its layer has the list read once more", async () => {
    const again = described("one-again", "Backscatter HH, 21 Oct 2026");
    const server = standIn();
    server.layers = [{ layer: again, source: REQUEST }];
    sessionStore.set(A_USER);
    list([]);
    stored([ONE], "a_user", { one: REQUEST }, { one: DISPLAY });
    jobsReadStore.set({ account: "a_user" });
    againStore.set({ one: "again" });
    jobsStore.set([job({ jobID: "again", status: "successful", layer: "one-again" })]);
    await vi.waitFor(() => expect(drawn()).toEqual(["one-again"]));
    expect(server.sent("GET", "/api/layers")).toHaveLength(1);
    expect(displayStore.get()).toEqual({ "one-again": DISPLAY });
    expect(againStore.get()).toEqual({});
  });

  test("a job of Get again whose layer the list does not hold after that reading is given up", async () => {
    const server = standIn();
    sessionStore.set(A_USER);
    list([]);
    stored([ONE], "a_user", { one: REQUEST });
    jobsReadStore.set({ account: "a_user" });
    againStore.set({ one: "again" });
    jobsStore.set([job({ jobID: "again", status: "successful", layer: "one-again" })]);
    await vi.waitFor(() => expect(againStore.get()).toEqual({}));
    expect(server.sent("GET", "/api/layers")).toHaveLength(1);
    expect(statesStore.get()).toEqual({ one: "removed" });
    expect(removedCommand(entryOf("one"), null)).toBe("getAgain");
  });

  test.each(["failed", "dismissed"] as const)(
    "a job of Get again that has %s lets the layer offer Get again once more",
    (status) => {
      sessionStore.set(A_USER);
      list([]);
      stored([ONE], "a_user", { one: REQUEST });
      jobsStore.set([job({ jobID: "again", status: "running" })]);
      jobsReadStore.set({ account: "a_user" });
      againStore.set({ one: "again" });
      jobsStore.set([job({ jobID: "again", status })]);
      expect(againStore.get()).toEqual({});
      expect(removedCommand(entryOf("one"), null)).toBe("getAgain");
    },
  );

  test("a job of Get again that has left the list of the account is forgotten, and not before the list is known", () => {
    sessionStore.set(A_USER);
    list([]);
    stored([ONE], "a_user", { one: REQUEST });
    againStore.set({ one: "again" });
    expect(againStore.get()).toEqual({ one: "again" });
    jobsReadStore.set({ account: "a_user" });
    expect(againStore.get()).toEqual({});
  });

  test("the inputs of a result are named by their layers, or by the product files of the result", () => {
    const entry: KeptLayer = { layer: CHANGE, account: "a_user", source: TOOL_RUN, aside: true };
    expect(inputWords(entry, [ONE, TWO])).toBe(
      'the layers "Backscatter HH, 21 Oct 2026" and "Backscatter HH, 2 Nov 2026"',
    );
    expect(inputWords(entry, [ONE])).toBe("the product files first.h5 and second.h5");
    expect(inputWords({ ...entry, source: null }, [ONE, TWO])).toBe("the product files first.h5 and second.h5");
    expect(toolWords("backscatter-change")).toBe("Backscatter, Change");
    expect(toolWords("another-tool")).toBe("another-tool");
    expect(removedWords({ ...entry, source: null }, { server: null, job: null, known: [] })).toBe(
      "The project server no longer keeps this result: it removed the result after the keeping time, or the result was removed elsewhere. An analysis tool made it from the product files first.h5 and second.h5.",
    );
  });
});

describe("while the page is open", () => {
  const show = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  test("the list of the server is read again every five minutes and when the page is shown again", async () => {
    vi.useFakeTimers();
    const server = standIn();
    server.layers = [{ layer: ONE }];
    sessionStore.set(A_USER);
    list([ONE]);
    addToMap(ONE);
    const stop = watchKept();
    expect(server.sent("GET", "/api/layers")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(server.sent("GET", "/api/layers")).toHaveLength(1);
    show("hidden");
    await vi.advanceTimersByTimeAsync(300_000);
    expect(server.sent("GET", "/api/layers")).toHaveLength(1);
    show("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.sent("GET", "/api/layers")).toHaveLength(2);

    // The server removes the layer; the next reading takes it off the map without a message.
    server.layers = [];
    await vi.advanceTimersByTimeAsync(300_000);
    expect(drawn()).toEqual([]);
    expect(statesStore.get()).toEqual({ one: "removed" });
    expect(messages()).toEqual([]);
    stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.sent("GET", "/api/layers")).toHaveLength(3);
  });

  test("a page without a kept layer reads no list", async () => {
    vi.useFakeTimers();
    const server = standIn();
    const stop = watchKept();
    await vi.advanceTimersByTimeAsync(600_000);
    show("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.received).toEqual([]);
    stop();
  });

  test("the page asks the project server again by itself while it does not answer, at growing intervals", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetch);
    sessionStore.set({ state: "unreachable" });
    stored([ONE]);
    const stop = watchKept();
    expect(statesStore.get()).toEqual({ one: "no-answer" });
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RETRY_TIME);
    // One question about the sign-in and one about the list.
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RETRY_TIME);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RETRY_TIME);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(RETRY_TIME).toBeLessThan(LONGEST_RETRY_TIME);

    // The server answers again: the layer is drawn, and the page stops asking.
    const server = standIn();
    server.layers = [{ layer: ONE }];
    const session = server.fetch.getMockImplementation();
    server.fetch.mockImplementation((input, init) =>
      input === "/api/session"
        ? Promise.resolve(new Response(JSON.stringify({ earthdata: { user: "a_user", token: true } })))
        : (session?.(input, init) ?? Promise.reject(new Error("no stand-in"))),
    );
    await vi.advanceTimersByTimeAsync(LONGEST_RETRY_TIME);
    expect(statesStore.get()).toEqual({ one: "ready" });
    expect(drawn()).toEqual(["one"]);
    const asked = server.received.length;
    await vi.advanceTimersByTimeAsync(LONGEST_RETRY_TIME);
    expect(server.received).toHaveLength(asked);
    expect(messages()).toEqual([]);
    stop();
  });
});
