// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addWhenReadyStore } from "../data/follow";
import { jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { GET_LAYER_PANE } from "../data/state";
import { job, standIn, type StandIn } from "../data/testSession";
import { SAMPLE } from "../header/notice/testLimits";
import { methodsStore } from "../help/state";
import { resetServersState } from "../servers/state";
import { LABORATORY, OFFICE, OFFICE_NAME, SERVERS } from "../servers/testServers";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { resetPanes } from "../shared/panes";
import { serversStore, type ServerName } from "../shared/servers";
import { AnalysisDialogs } from "./AnalysisDialogs";
import { rowOf } from "./methods";
import { METHODS } from "./methodSheets";
import {
  coherence,
  components,
  earlierPair,
  GCOV_NOV,
  GUNW_PAIR,
  GUNW_SEP,
  laterPair,
  laterSoil,
  laterTerm,
  longPair,
  phase,
  SME2_OCT,
  soil,
  term,
} from "./testLayers";
import {
  ABOUT,
  GET_COMPONENTS,
  GET_OTHER_PAIR,
  GET_PARTNER,
  OF_ONE_PRODUCT,
  RECEIVE,
  runOf,
  SECOND,
  ToolForm,
  unnamedSentence,
  type Started,
} from "./ToolForm";
import {
  CHOOSE_COMPONENTS,
  FINISHED_TOOLS,
  modesSentence,
  NO_COMPONENTS,
  NO_FREQUENCY,
  NO_INPUT,
  NO_OTHER_PAIR,
  NO_PARTNER,
  OVERLAP,
  READS,
  spansSentence,
  type FinishedTool,
} from "./tools";

let server: StandIn;

beforeEach(() => {
  resetDock();
  resetPanes();
  resetJobs();
  resetLayers();
  addWhenReadyStore.set(true);
  mapLayersStore.set([]);
  messagesStore.set([]);
  methodsStore.set({ open: false, tool: null });
  serversStore.set(null);
  resetServersState();
  server = standIn();
});

afterEach(() => {
  resetJobs();
  resetLayers();
  vi.unstubAllGlobals();
});

/**
 * Show the form of a tool, open, in a session that holds the given layers. `keeper` names the own server that
 * keeps the layers; without it the project server keeps them.
 */
function show(tool: FinishedTool, layers: readonly LayerDescription[] = [], keeper: ServerName | null = null) {
  layersStore.set(layers.map((layer) => ({ layer, size: null, created: null, server: keeper })));
  openToolPane(tool);
  render(<ToolForm tool={tool} />);
}

/** Give the visitor the own servers of the examples: the Office computer is connected, the Laboratory server is not. */
function withServers() {
  server.servers = SERVERS;
  server.limits = SAMPLE;
  serversStore.set(SERVERS);
}

const serverChoice = () => screen.getByLabelText<HTMLSelectElement>("Server");
const serverRows = () =>
  [...document.querySelectorAll(".server-choice .property-row")].map(
    (row) =>
      `${row.querySelector(".property-name")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
const missing = () => document.querySelector(".tool-pane-missing")?.textContent ?? null;

/** The texts of the choices of a list. */
function options(label: string): (string | null)[] {
  return within(screen.getByLabelText(label))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

/** The value of the row of a list of names and values that carries a name, inside an element. */
function valueOf(element: HTMLElement, name: string): string | null {
  const row = Array.from(element.querySelectorAll(".property-row")).find(
    (candidate) => candidate.querySelector(".property-name > span")?.textContent === name,
  );
  return row?.querySelector(".property-value-text")?.textContent ?? null;
}

function runButton(): HTMLElement {
  return screen.getByRole("button", { name: "Run" });
}

const STARTED: Started = { id: "job-1", sending: false, fault: null, cancelled: false };

test("the foot shows nothing before the first run, and that the job is being started while the request is sent", () => {
  expect(runOf(null, [])).toBeNull();
  expect(runOf({ id: null, sending: true, fault: null, cancelled: false }, [])).toEqual({
    state: "running",
    text: "Starting the job",
  });
});

test("the foot shows a refusal of the request in the sentence of the server", () => {
  const fault = "Your session holds 20 layers, and it can hold no more.";
  expect(runOf({ id: null, sending: false, fault, cancelled: false }, [])).toEqual({ state: "error", text: fault });
});

test("the foot shows the progress and the sentence of a job that waits or runs", () => {
  const waiting = job({ jobID: "job-1", status: "accepted", message: "The job waits for its turn.", progress: 0 });
  expect(runOf(STARTED, [waiting])).toEqual({
    state: "running",
    progress: 0,
    text: "Waiting. The job waits for its turn.",
  });
  const running = job({ jobID: "job-1", status: "running", message: "Computing the result.", progress: 40 });
  expect(runOf(STARTED, [running])).toEqual({
    state: "running",
    progress: 0.4,
    text: "Running. Computing the result.",
  });
});

test("the foot states that the result is ready, and where it is", () => {
  const done = job({
    jobID: "job-1",
    status: "successful",
    message: "The result is ready.",
    progress: 100,
    layer: "result-1",
  });
  const listed = runOf(STARTED, [done]);
  expect(listed).toMatchObject({
    state: "success",
    text: "The result is ready. It is under Layers in the Catalog pane.",
  });
  expect(listed && "action" in listed ? listed.action?.label : null).toBe("Show the Catalog pane");
  expect(runOf(STARTED, [done], new Set(["result-1"]))).toMatchObject({
    state: "success",
    text: "The result is ready. It is on the map and under Layers in the Catalog pane.",
  });
});

test("the foot shows the refusal of a tool in the sentence of the server", () => {
  const message = "The layers of the analysis do not have the same grid.";
  const failed = job({ jobID: "job-1", status: "failed", message, progress: 0 });
  expect(runOf(STARTED, [failed])).toMatchObject({ state: "error", text: message });
});

test("the foot states that a job was cancelled or has left the list", () => {
  expect(runOf({ ...STARTED, cancelled: true }, [])).toEqual({ state: "warning", text: "The job was cancelled." });
  expect(runOf(STARTED, [])).toEqual({ state: "warning", text: "The job is no longer in the list of jobs." });
});

test("the explanations of the titles of the form are short", () => {
  expect(ABOUT).toEqual({
    layer: "A layer that this session received with Get layer.",
    pair: "The same layer of two dates of one track and frame; the earlier date is taken first.",
    pairs:
      "The same coherence layer of two pairs of dates of one track and frame, which span the same number of days; the earlier pair is taken first.",
    phase:
      "An Unwrapped phase layer of a GUNW product, which holds the change of the distance to the radar between the two dates as an angle.",
    components:
      "The Connected components layer of the same product, channel and area, which marks the cells where the unwrapped phase is unreliable.",
    title: "The name of the result in the Catalog and Contents panes.",
  });
  // Each explanation is one sentence.
  for (const about of Object.values(ABOUT)) {
    expect(about).toMatch(/^[A-Z][^.]*\.$/);
  }
});

test("the second field is named after what the tool compares: the other date, or the other pair of dates", () => {
  expect(SECOND).toEqual({
    dates: { title: "Layer of the other date", about: ABOUT.pair, get: GET_PARTNER },
    pairs: { title: "Layer of the other pair", about: ABOUT.pairs, get: GET_OTHER_PAIR },
  });
  expect(GET_OTHER_PAIR).toBe(
    "No other pair of dates of this layer is in the session. Get the same layer of another pair of dates of the same track and frame.",
  );
});

test.each(FINISHED_TOOLS)("the i of the pane of %s states what the tool shows, in the words of its sheet", (tool) => {
  show(tool);
  const shows = rowOf(METHODS[tool], "What it shows");
  expect(shows).not.toBe("");
  expect(screen.getByRole("complementary", { name: METHODS[tool].title }).textContent).toContain(shows);
});

test.each(FINISHED_TOOLS)(
  "the form of %s opens in a pane beside the map under the title of its method sheet",
  (tool) => {
    show(tool);
    expect(screen.getByRole("complementary", { name: METHODS[tool].title })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

test.each(FINISHED_TOOLS)(
  "without a layer that %s reads, the pane names the layer to get and offers Get layer",
  async (tool) => {
    show(tool, READS[tool].product === "GUNW" ? [term()] : [coherence()]);
    expect(screen.getByText("No layer to use")).toBeDefined();
    // The empty state names the next step, and the foot says why the run button is inactive: each thing once.
    expect(screen.getAllByText(RECEIVE[tool])).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(NO_INPUT);
    expect(NO_INPUT).toBe("No layer of this session can be used by the tool.");
    expect(screen.queryByLabelText("Result name")).toBeNull();
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(runButton());
    expect(server.sent("POST")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
    expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
  },
);

test("the layer to get is named as the Get layer form names it", () => {
  expect(RECEIVE).toEqual({
    "backscatter-state": "Get a Backscatter layer of a GCOV product.",
    "backscatter-change": "Get the same Backscatter layer of two GCOV products of one track and frame.",
    "coherence-state": "Get a Coherence layer of a GUNW product.",
    "coherence-change": "Get the same Coherence layer of two GUNW products of one track and frame.",
    "displacement-state":
      "Get the Unwrapped phase layer and the Connected components layer of one GUNW product, for the same area.",
    "soil-moisture-state": "Get the Soil moisture layer of an SME2 product.",
    "soil-moisture-change": "Get the Soil moisture layer of two SME2 products of one track and frame.",
  });
  for (const sentence of Object.values(RECEIVE)) {
    expect(sentence).toMatch(/^Get [^.]*\.$/);
  }
});

test("the field Layer offers the layers that the tool reads, and no other", () => {
  show("backscatter-state", [
    laterTerm(),
    term(),
    coherence(),
    term({ id: "looks", title: "Number of looks", layer: "numberOfLooks" }),
  ]);
  expect(options("Layer")).toEqual([
    "Select a layer",
    "Backscatter HH, 2 Nov 2026 (track 141, frame 67, descending)",
    "Backscatter HH, 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
});

test("Coherence, One pair offers the coherence layers of the session", () => {
  show("coherence-state", [term(), coherence()]);
  expect(options("Layer")).toEqual([
    "Select a layer",
    "Coherence HH, 80 m, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
});

test("Soil moisture, One date offers the soil moisture layers of the session, and no other", () => {
  show("soil-moisture-state", [
    term(),
    coherence(),
    soil(),
    laterSoil(),
    soil({ id: "uncertainty", title: "Soil moisture uncertainty, 27 Sep 2026", layer: "soilMoistureUncertainty" }),
  ]);
  expect(options("Layer")).toEqual([
    "Select a layer",
    "Soil moisture, 27 Sep 2026 (track 141, frame 67, descending)",
    "Soil moisture, 9 Oct 2026 (track 141, frame 67, descending)",
  ]);
  expect(screen.queryByLabelText("Layer of the other date")).toBeNull();
});

test("Coherence, Change offers the coherence layers of the session in its first field", () => {
  show("coherence-change", [term(), soil(), coherence(), earlierPair(), laterPair()]);
  expect(options("Layer")).toEqual([
    "Select a layer",
    "Coherence HH, 80 m, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
    "Coherence HH, 20 m, 27 Sep 2026 to 9 Oct 2026 (track 141, frame 67, descending)",
    "Coherence HH, 20 m, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
  expect(screen.getByLabelText<HTMLSelectElement>("Layer of the other pair").disabled).toBe(true);
});

test("while no layer is chosen, the foot states it and the run button is inactive", async () => {
  show("backscatter-state", [term()]);
  expect(screen.getByText("Choose a layer.")).toBeDefined();
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("the form proposes the name of the result from the chosen layer, until the visitor changes the name", async () => {
  show("backscatter-state", [term(), laterTerm()]);
  const name = screen.getByLabelText<HTMLInputElement>("Result name");
  expect(name.value).toBe("");
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(name.value).toBe("Backscatter HH in dB, 21 Oct 2026");
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-nov");
  expect(name.value).toBe("Backscatter HH in dB, 2 Nov 2026");
  await userEvent.clear(name);
  await userEvent.type(name, "My result");
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(name.value).toBe("My result");
});

test("a tool of one input starts as a job of the process of its name, with the layer and the name of the result", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(runButton().getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/backscatter-state/execution",
      content: { inputs: { inputs: ["hh-oct"], title: "Backscatter HH in dB, 21 Oct 2026" } },
    },
  ]);
  expect(jobsStore.get().map(({ jobID, processID }) => [jobID, processID])).toEqual([["job-1", "backscatter-state"]]);
  expect(screen.getByText(/^Waiting\. The job waits for its turn\./)).toBeDefined();
});

test("Coherence, One pair starts as a job of its process", async () => {
  show("coherence-state", [coherence()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "coherence-80");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/coherence-state/execution",
      content: {
        inputs: { inputs: ["coherence-80"], title: "Coherence magnitude HH, 80 m, 9 Oct 2026 to 21 Oct 2026" },
      },
    },
  ]);
});

test("Soil moisture, One date starts as a job of its process", async () => {
  show("soil-moisture-state", [soil()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "soil-sep");
  expect(document.querySelector(".tool-pane-body .property-row")).toBeNull();
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/soil-moisture-state/execution",
      content: { inputs: { inputs: ["soil-sep"], title: "Volumetric soil moisture, 27 Sep 2026" } },
    },
  ]);
});

test.each([
  ["soil-sep", "soil-oct"],
  ["soil-oct", "soil-sep"],
])("Soil moisture, Change sends the layer of the earlier date first (fields %s and %s)", async (first, second) => {
  show("soil-moisture-change", [
    laterSoil(),
    soil(),
    laterSoil({ id: "track-104", inputs: [SME2_OCT.replace("_141_D_067_", "_104_A_067_")] }),
    term(),
  ]);
  expect(screen.getByLabelText<HTMLSelectElement>("Layer of the other date").disabled).toBe(true);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), first);
  // The layer of another track is a layer that the tool reads, and it does not stand beside this one.
  expect(options("Layer")).toHaveLength(3);
  expect(options("Layer of the other date")).toHaveLength(2);
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), second);
  expect(valueOf(document.body, "Dates")).toBe("27 Sep 2026 to 9 Oct 2026");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/soil-moisture-change/execution",
      content: {
        inputs: { inputs: ["soil-sep", "soil-oct"], title: "Change of soil moisture, 27 Sep 2026 to 9 Oct 2026" },
      },
    },
  ]);
});

test("two soil moisture layers of the same date are refused at the second field", async () => {
  show("soil-moisture-change", [soil(), soil({ id: "again", title: "Soil moisture, 27 Sep 2026, second copy" })]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "soil-sep");
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), "again");
  await userEvent.tab();
  expect(screen.getByRole("alert").textContent).toBe("Choose a layer of another date.");
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
});

test.each([
  ["pair-sep", "pair-oct"],
  ["pair-oct", "pair-sep"],
])("Coherence, Change sends the layer of the earlier pair first (fields %s and %s)", async (first, second) => {
  show("coherence-change", [laterPair(), earlierPair()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), first);
  expect(screen.getByText("Choose the layer of the other pair.")).toBeDefined();
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other pair"), second);
  expect(valueOf(document.body, "Dates")).toBe("27 Sep 2026 to 9 Oct 2026, then 9 Oct 2026 to 21 Oct 2026");
  // The interface writes a day with `formatDay`, which shortens September to "Sep", as the server does.
  const title = "Change of coherence magnitude HH, 20 m, 27 Sep 2026 to 9 Oct 2026, then 9 Oct 2026 to 21 Oct 2026";
  expect(screen.getByLabelText<HTMLInputElement>("Result name").value).toBe(title);
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/coherence-change/execution",
      content: { inputs: { inputs: ["pair-sep", "pair-oct"], title } },
    },
  ]);
});

test("the second field of Coherence, Change offers only the same coherence layer of the same track and frame", async () => {
  show("coherence-change", [
    earlierPair(),
    laterPair(),
    longPair(),
    coherence(),
    laterPair({
      id: "pair-vv",
      title: "Coherence VV, 20 m, 9 Oct 2026 to 21 Oct 2026",
      layer: "wrappedInterferogram/VV/coherenceMagnitude",
    }),
    laterPair({ id: "frame-68", inputs: [GUNW_PAIR.replace("_141_D_067_", "_141_D_068_")] }),
    term(),
  ]);
  expect(options("Layer")).toHaveLength(7);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "pair-sep");
  expect(options("Layer of the other pair")).toEqual([
    "Select a layer",
    "Coherence HH, 20 m, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
    "Coherence HH, 20 m, 17 Jul 2026 to 10 Aug 2026 (track 141, frame 67, descending)",
  ]);
});

test.each([
  { pairs: "pairs of unequal spans", other: longPair(), sentence: spansSentence(24, 12) },
  {
    pairs: "the same pair twice",
    other: laterPair({ id: "pair-jul", title: "Coherence HH, 20 m, second copy" }),
    sentence: OVERLAP,
  },
  {
    pairs: "pairs of two bandwidths",
    other: earlierPair({ id: "pair-jul", inputs: [GUNW_PAIR.replace("_033_4000_SH_", "_033_2000_SH_")] }),
    sentence: modesSentence("4000", "2000"),
  },
])("Coherence, Change says in one sentence why it does not compare $pairs", async ({ other, sentence }) => {
  show("coherence-change", [laterPair(), other]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "pair-oct");
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other pair"), "pair-jul");
  // The foot states the fault at once, and the field states it after it was left.
  expect(missing()).toBe(sentence);
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.tab();
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(sentence);
  const field = screen.getByLabelText("Layer of the other pair");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  // No row Dates and no name are proposed for two layers that the tool does not compare.
  expect(document.querySelector(".tool-pane-body .property-row")).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>("Result name").value).toBe("");
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("a coherence layer without another pair of dates is stated, with the way to the Get layer form", async () => {
  show("coherence-change", [laterPair(), coherence()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "pair-oct");
  expect(screen.getByLabelText<HTMLSelectElement>("Layer of the other pair").disabled).toBe(true);
  expect(screen.getByText(GET_OTHER_PAIR)).toBeDefined();
  expect(screen.getAllByText(NO_OTHER_PAIR, { exact: false })).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
});

test("the second field of Backscatter, Change is inactive until the first layer is chosen", async () => {
  show("backscatter-change", [term(), laterTerm()]);
  expect(screen.getByLabelText<HTMLSelectElement>("Layer of the other date").disabled).toBe(true);
  expect(screen.getByText("Choose a layer.")).toBeDefined();
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(screen.getByLabelText<HTMLSelectElement>("Layer of the other date").disabled).toBe(false);
  expect(screen.getByText("Choose the layer of the other date.")).toBeDefined();
});

test("the second field offers only the layers of the same term, track, direction and frame as the first", async () => {
  show("backscatter-change", [
    term(),
    laterTerm(),
    laterTerm({ id: "hv-nov", title: "Backscatter HV, 2 Nov 2026", layer: "HVHV" }),
    laterTerm({ id: "frame-68", inputs: [GCOV_NOV.replace("_141_D_067_", "_141_D_068_")] }),
    laterTerm({ id: "ascending", inputs: [GCOV_NOV.replace("_141_D_067_", "_141_A_067_")] }),
    laterTerm({ id: "track-142", inputs: [GCOV_NOV.replace("_141_D_067_", "_142_D_067_")] }),
    coherence(),
  ]);
  expect(options("Layer")).toHaveLength(7);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(options("Layer of the other date")).toEqual([
    "Select a layer",
    "Backscatter HH, 2 Nov 2026 (track 141, frame 67, descending)",
  ]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hv-nov");
  expect(options("Layer of the other date")).toEqual(["Select a layer"]);
});

test.each([
  ["hh-oct", "hh-nov"],
  ["hh-nov", "hh-oct"],
])("Backscatter, Change sends the layer of the earlier date first (fields %s and %s)", async (first, second) => {
  show("backscatter-change", [laterTerm(), term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), first);
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), second);
  expect(valueOf(document.body, "Dates")).toBe("21 Oct 2026 to 2 Nov 2026");
  expect(screen.getByLabelText<HTMLInputElement>("Result name").value).toBe(
    "Change of backscatter HH in dB, 21 Oct 2026 to 2 Nov 2026",
  );
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/backscatter-change/execution",
      content: {
        inputs: { inputs: ["hh-oct", "hh-nov"], title: "Change of backscatter HH in dB, 21 Oct 2026 to 2 Nov 2026" },
      },
    },
  ]);
});

test("two layers of the same date are refused at the second field, and the tool does not run", async () => {
  show("backscatter-change", [term(), term({ id: "again", title: "Backscatter HH, 21 Oct 2026, second copy" })]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), "again");
  await userEvent.tab();
  const sentence = "Choose a layer of another date.";
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(sentence);
  const field = screen.getByLabelText("Layer of the other date");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.classList.contains("usa-input--error")).toBe(true);
  expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(screen.getAllByText(sentence)).toHaveLength(2);
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("a first layer without a matching layer is stated, with the way to the Get layer form", async () => {
  show("backscatter-change", [term(), laterTerm({ layer: "HVHV" })]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(screen.getByLabelText<HTMLSelectElement>("Layer of the other date").disabled).toBe(true);
  expect(GET_PARTNER).toBe(
    "No other date of this layer is in the session. Get the same layer of another date of the same track and frame.",
  );
  expect(screen.getByText(GET_PARTNER)).toBeDefined();
  expect(screen.getAllByText(NO_PARTNER, { exact: false })).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
});

test("an empty name of the result is refused at its field after the field is left", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  const name = screen.getByLabelText("Result name");
  await userEvent.clear(name);
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.tab();
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe("Give a name.");
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(name.classList.contains("usa-input--error")).toBe(true);
  expect(name.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.type(name, "Decibels");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(name.getAttribute("aria-invalid")).toBeNull();
  expect(name.classList.contains("usa-input--error")).toBe(false);
  expect(runButton().getAttribute("aria-disabled")).toBeNull();
});

test("Surface displacement, One pair shows its two layer fields, proposes a name and starts its process", async () => {
  show("displacement-state", [components(), coherence(), phase(), term()]);
  expect(options("Unwrapped phase")).toEqual([
    "Select a layer",
    "Unwrapped phase HH, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
  expect(screen.getByLabelText<HTMLSelectElement>("Connected components").disabled).toBe(true);
  expect(missing()).toBe("Choose a layer.");
  await userEvent.selectOptions(screen.getByLabelText("Unwrapped phase"), "phase-hh");
  expect(screen.getByLabelText<HTMLSelectElement>("Connected components").disabled).toBe(false);
  expect(missing()).toBe(CHOOSE_COMPONENTS);
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.selectOptions(screen.getByLabelText("Connected components"), "components-hh");
  const body = document.querySelector(".tool-pane-body");
  expect(Array.from(body?.querySelectorAll("label") ?? [], (label) => label.textContent)).toEqual([
    "Unwrapped phase",
    "Connected components",
    "Result name",
    "Add to the map when ready",
  ]);
  // The two layers are of one pair, so the form shows no row Dates.
  expect(body?.querySelectorAll(".property-row")).toHaveLength(0);
  expect(screen.getByLabelText<HTMLInputElement>("Result name").value).toBe(
    "Surface displacement HH, 9 Oct 2026 to 21 Oct 2026",
  );
  expect(runButton().getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/displacement-state/execution",
      content: {
        inputs: {
          inputs: ["phase-hh", "components-hh"],
          title: "Surface displacement HH, 9 Oct 2026 to 21 Oct 2026",
        },
      },
    },
  ]);
});

test("the field Connected components offers only the layer of the product and the channel of the unwrapped phase", async () => {
  const vertical = "unwrappedInterferogram/VV/";
  show("displacement-state", [
    phase(),
    phase({
      id: "phase-vv",
      title: "Unwrapped phase VV, 9 Oct 2026 to 21 Oct 2026",
      layer: `${vertical}unwrappedPhase`,
    }),
    components(),
    components({
      id: "components-vv",
      title: "Connected components VV, 9 Oct 2026 to 21 Oct 2026",
      layer: `${vertical}connectedComponents`,
    }),
    components({
      id: "components-earlier",
      title: "Connected components HH, 27 Sep 2026 to 9 Oct 2026",
      dates: ["2026-09-27", "2026-10-09"],
      inputs: [GUNW_SEP],
    }),
    coherence(),
  ]);
  await userEvent.selectOptions(screen.getByLabelText("Unwrapped phase"), "phase-hh");
  expect(options("Connected components")).toEqual([
    "Select a layer",
    "Connected components HH, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
  await userEvent.selectOptions(screen.getByLabelText("Unwrapped phase"), "phase-vv");
  expect(options("Connected components")).toEqual([
    "Select a layer",
    "Connected components VV, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
});

test("an unwrapped phase without the frequency of the radar is refused at its field, and the tool does not run", async () => {
  show("displacement-state", [phase({ frequency: null }), components()]);
  await userEvent.selectOptions(screen.getByLabelText("Unwrapped phase"), "phase-hh");
  await userEvent.selectOptions(screen.getByLabelText("Connected components"), "components-hh");
  expect(missing()).toBe(NO_FREQUENCY);
  screen.getByLabelText("Unwrapped phase").focus();
  await userEvent.tab();
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(NO_FREQUENCY);
  const field = screen.getByLabelText("Unwrapped phase");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(screen.getByLabelText<HTMLInputElement>("Result name").value).toBe("");
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("an unwrapped phase without its connected components is stated, with the way to the Get layer form", async () => {
  show("displacement-state", [phase(), components({ inputs: [GUNW_SEP] })]);
  await userEvent.selectOptions(screen.getByLabelText("Unwrapped phase"), "phase-hh");
  expect(screen.getByLabelText<HTMLSelectElement>("Connected components").disabled).toBe(true);
  expect(GET_COMPONENTS).toBe(
    "The Connected components layer of this product is not in the session. Get the Connected components layer of the same product, channel and area.",
  );
  expect(screen.getByText(GET_COMPONENTS)).toBeDefined();
  expect(missing()).toBe(NO_COMPONENTS);
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
});

test("the two fields of Surface displacement, One pair are named after their layers, each with one sentence", () => {
  expect(OF_ONE_PRODUCT).toEqual({
    first: { title: "Unwrapped phase", about: ABOUT.phase },
    second: { title: "Connected components", about: ABOUT.components, get: GET_COMPONENTS },
  });
  for (const sentence of [ABOUT.phase, ABOUT.components]) {
    expect(sentence).toMatch(/^[A-Z][^.]*\.$/);
  }
});

test("layers that do not record which layer of their product they are, are counted, with what to do", () => {
  expect(unnamedSentence(1)).toBe("1 older layer of this session cannot be used. Get it again with Get layer.");
  expect(unnamedSentence(2)).toBe("2 older layers of this session cannot be used. Get them again with Get layer.");
  show("backscatter-state", [term({ layer: null }), term({ id: "older", layer: undefined }), laterTerm()]);
  expect(options("Layer")).toEqual(["Select a layer", "Backscatter HH, 2 Nov 2026 (track 141, frame 67, descending)"]);
  expect(screen.getByText(unnamedSentence(2))).toBeDefined();
});

test("a refusal of the request is shown in the sentence of the server", async () => {
  const sentence = "Your session holds as many layers as it may. Remove a layer and try again.";
  server.refuse("POST", "/api/processes/backscatter-state/execution", 507, sentence);
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.click(runButton());
  expect(screen.getByRole("alert").textContent).toBe(sentence);
  expect(jobsStore.get()).toEqual([]);
});

test("the refusal of a tool is shown in the sentence of the server when its job has failed", async () => {
  show("backscatter-change", [term(), laterTerm()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), "hh-nov");
  await userEvent.click(runButton());
  const sentence = "The layers of the analysis do not have the same grid.";
  server.change("job-1", { status: "failed", message: sentence, progress: 0 });
  await act(loadJobs);
  expect(screen.getByRole("alert").textContent).toBe(sentence);
});

test("a finished job is stated at the foot, with the link to the Catalog pane", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.click(runButton());
  server.change("job-1", { status: "successful", message: "The result is ready.", progress: 100, layer: "result-1" });
  await act(loadJobs);
  expect(screen.getByText("The result is ready. It is under Layers in the Catalog pane.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Show the Catalog pane" })).toBeDefined();
  expect(screen.getByRole("button", { name: "View details" })).toBeDefined();
});

test("a job that waits can be cancelled from the form", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.click(runButton());
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(server.sent("DELETE")).toEqual([{ method: "DELETE", address: "/api/jobs/job-1", content: undefined }]);
  expect(screen.getByText("The job was cancelled.")).toBeDefined();
  expect(jobsStore.get()).toEqual([]);
});

test("the check box of the form decides whether the result is added to the map when it is ready", async () => {
  show("backscatter-state", [term()]);
  const box = screen.getByLabelText<HTMLInputElement>("Add to the map when ready");
  expect(box.checked).toBe(true);
  await userEvent.click(box);
  expect(addWhenReadyStore.get()).toBe(false);
});

test.each(FINISHED_TOOLS)("the form of %s shows no section and no list of its method", (tool) => {
  show(tool);
  expect(screen.queryByRole("group", { name: "Method" })).toBeNull();
  expect(document.querySelector(".property-list")).toBeNull();
});

test("a form with a layer shows its fields in their order, and nothing else", async () => {
  show("backscatter-change", [term(), laterTerm()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), "hh-nov");
  const body = document.querySelector(".tool-pane-body");
  expect(Array.from(body?.querySelectorAll("label") ?? [], (label) => label.textContent)).toEqual([
    "Layer",
    "Layer of the other date",
    "Result name",
    "Add to the map when ready",
  ]);
  expect(body?.querySelectorAll(".property-row")).toHaveLength(1);
});

test.each([
  ["coherence-change", [earlierPair(), laterPair()], ["pair-sep", "pair-oct"], "Layer of the other pair"],
  ["soil-moisture-change", [soil(), laterSoil()], ["soil-sep", "soil-oct"], "Layer of the other date"],
] as const)(
  "the form of %s shows the fields of a tool that compares, and nothing else",
  async (tool, layers, ids, other) => {
    show(tool, layers);
    await userEvent.selectOptions(screen.getByLabelText("Layer"), ids[0]);
    await userEvent.selectOptions(screen.getByLabelText(other), ids[1]);
    const body = document.querySelector(".tool-pane-body");
    expect(Array.from(body?.querySelectorAll("label") ?? [], (label) => label.textContent)).toEqual([
      "Layer",
      other,
      "Result name",
      "Add to the map when ready",
    ]);
    expect(body?.querySelectorAll(".property-row")).toHaveLength(1);
    expect(body?.querySelector(".usa-alert")).toBeNull();
  },
);

test("the form of Soil moisture, One date shows the fields of a tool of one input, and nothing else", async () => {
  show("soil-moisture-state", [soil()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "soil-sep");
  const body = document.querySelector(".tool-pane-body");
  expect(Array.from(body?.querySelectorAll("label") ?? [], (label) => label.textContent)).toEqual([
    "Layer",
    "Result name",
    "Add to the map when ready",
  ]);
  expect(body?.querySelectorAll(".property-row")).toHaveLength(0);
  expect(body?.querySelector(".usa-alert")).toBeNull();
});

test("a visitor without an own server has no field Server in the form of a tool", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(screen.queryByLabelText("Server")).toBeNull();
});

test("a visitor with an own server chooses the server of a tool, Automatic at first, and the job names no server", async () => {
  withServers();
  show("backscatter-state", [term()], OFFICE_NAME);
  expect(serverChoice().value).toBe("automatic");
  // Before a layer is chosen the job would go to the connected own server; the chosen layer is kept there too.
  expect(serverRows()[0]).toBe("At present: Office computer");
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(serverRows()[0]).toBe("At present: Office computer");
  const body = document.querySelector(".tool-pane-body");
  expect(Array.from(body?.querySelectorAll("label") ?? [], (label) => label.textContent)).toEqual([
    "Layer",
    "Result name",
    "Server",
    "Add to the map when ready",
  ]);
  await userEvent.click(runButton());
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]?.address).toBe("/api/processes/backscatter-state/execution");
});

test("Automatic names the project server for a layer that the project server keeps", async () => {
  withServers();
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(serverRows()[0]).toBe("At present: Project server");
});

test("a tool is started on the server that the visitor chose, with the limits of that server under the field", async () => {
  withServers();
  show("backscatter-state", [term()], OFFICE_NAME);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.selectOptions(serverChoice(), OFFICE.id);
  expect(serverRows()).toEqual([
    "Jobs at the same time: 4 (1 running, 2 waiting)",
    "Largest layer: 10 GB",
    "Most cells of a layer: 100 million",
    "Space for layers: 1.3 GB of 100 GB used",
    "Free disk space: 412 GB",
  ]);
  expect(document.querySelector(".server-choice .usa-alert")).toBeNull();
  await userEvent.click(runButton());
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]).toEqual({
    method: "POST",
    address: `/api/processes/backscatter-state/execution?server=${OFFICE.id}`,
    content: { inputs: { inputs: ["hh-oct"], title: "Backscatter HH in dB, 21 Oct 2026" } },
  });
  expect(jobsStore.get()[0]?.server).toEqual(OFFICE_NAME);
});

test("the form says that a chosen layer is kept on another server than the one chosen", async () => {
  withServers();
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(serverChoice(), OFFICE.id);
  const apart =
    "An input layer is kept on another server. A tool takes the input layers of the server on which it runs, so choose Automatic or the server of the layers.";
  // No layer is chosen yet, so nothing is kept elsewhere.
  expect(screen.queryByText(apart)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(screen.getByText(apart)).toBeDefined();
  await userEvent.selectOptions(serverChoice(), "project");
  expect(screen.queryByText(apart)).toBeNull();
});

test("the two layers of Backscatter, Change on different servers are named under Automatic", async () => {
  withServers();
  layersStore.set([
    { layer: term(), size: null, created: null, server: OFFICE_NAME },
    { layer: laterTerm(), size: null, created: null, server: null },
  ]);
  openToolPane("backscatter-change");
  render(<ToolForm tool="backscatter-change" />);
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  await userEvent.selectOptions(screen.getByLabelText("Layer of the other date"), "hh-nov");
  expect(
    screen.getByText("The input layers are kept on different servers. A tool takes the input layers of one server."),
  ).toBeDefined();
  expect(serverRows()[0]).toBe("At present: Project server");
});

test("a chosen server that is not connected is the last thing that the foot of a tool names, and nothing is sent", async () => {
  withServers();
  show("backscatter-state", [term()], { id: LABORATORY.id, name: LABORATORY.name });
  await userEvent.selectOptions(serverChoice(), LABORATORY.id);
  expect(missing()).toBe("Choose a layer.");
  await userEvent.selectOptions(screen.getByLabelText("Layer"), "hh-oct");
  expect(missing()).toBe('Choose a server that is connected: "Laboratory server" is not.');
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
  expect(
    screen.getByText(
      'The server "Laboratory server" is not connected. Start Lynkeus Server on that computer, or choose another server.',
    ),
  ).toBeDefined();
});

test("the link Method at the foot opens the page Methods at the tool", async () => {
  show("backscatter-change");
  const link = screen.getByRole("button", { name: "Method" });
  expect(link.closest(".tool-pane-secondary")).not.toBeNull();
  await userEvent.click(link);
  expect(methodsStore.get()).toEqual({ open: true, tool: "backscatter-change" });
});

test("the Analysis tab holds the form of each finished tool, closed until its button opens it", () => {
  render(<AnalysisDialogs />);
  expect(screen.queryByRole("complementary")).toBeNull();
  for (const tool of FINISHED_TOOLS) {
    act(() => openToolPane(tool));
    expect(screen.getByRole("complementary", { name: METHODS[tool].title })).toBeDefined();
  }
});
