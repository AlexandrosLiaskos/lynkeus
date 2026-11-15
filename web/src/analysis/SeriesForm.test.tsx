import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { loadSeries, resetSeries, SERIES_PANE, shownSeriesStore } from "../data/series";
import { GET_LAYER_PANE } from "../data/state";
import { series, seriesItem } from "../data/testSeries";
import { job, standIn, type StandIn } from "../data/testSession";
import { methodsStore } from "../help/state";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { messagesStore } from "../shared/messages/messages";
import { resetPanes } from "../shared/panes";
import type { ServerName } from "../shared/servers";
import { rowOf } from "./methods";
import { METHODS } from "./methodSheets";
import {
  ANGLE_FAULTS,
  NO_LAYERS,
  noComponentsSentence,
  REFERENCE_FAULTS,
  SERIES_TOOLS,
  type SeriesTool,
} from "./series";
import { ABOUT_RELATIVE, ABOUT_SERIES, ownServerSentence, RECEIVE_SERIES, SeriesForm, seriesRunOf } from "./SeriesForm";
import { coherence, components, GUNW_SEP, laterTerm, phase, term } from "./testLayers";
import type { Started } from "./ToolForm";

let server: StandIn;

beforeEach(() => {
  resetDock();
  resetPanes();
  resetJobs();
  resetLayers();
  resetSeries();
  messagesStore.set([]);
  methodsStore.set({ open: false, tool: null });
  server = standIn();
});

afterEach(() => {
  resetJobs();
  resetLayers();
  resetSeries();
  vi.unstubAllGlobals();
});

const SEP = term({
  id: "hh-sep",
  title: "Backscatter HH, 27 Sep 2026",
  dates: ["2026-09-27"],
  inputs: ["NISAR_L2_PR_GCOV_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001.h5"],
});
const THREE = [laterTerm(), SEP, term()];

/** Show the form of a tool, open, in a session that holds the given layers on the project server. */
function show(tool: SeriesTool, layers: readonly LayerDescription[] = [], keeper: ServerName | null = null) {
  layersStore.set(layers.map((layer) => ({ layer, size: null, created: null, server: keeper })));
  openToolPane(tool);
  render(<SeriesForm tool={tool} />);
}

const missing = () => document.querySelector(".tool-pane-missing")?.textContent ?? null;
const runButton = () => screen.getByRole("button", { name: "Run" });
const boxes = () =>
  within(screen.getByRole("group", { name: "Layers of the series" }))
    .getAllByRole<HTMLInputElement>("checkbox")
    .map((box) => [box.labels?.[0]?.textContent ?? "", box.checked]);

const STARTED: Started = { id: "job-1", sending: false, fault: null, cancelled: false };

test("the explanations of the titles of the form are one sentence each", () => {
  expect(ABOUT_SERIES).toEqual({
    group:
      "The layer of the product, with the track, the frame, the direction of the orbit and the release of its products.",
    layers: "The same layer of two or more dates, received with Get layer and kept on the project server.",
    place: "The series gives the mean of the whole area of the layers, or the value of the cell that holds a point.",
    latitude: "The latitude of the point in degrees, as 42.8 or 42.8 N or 42° 48′ 30″ N.",
    longitude: "The longitude of the point in degrees, as -70.9 or 70.9 W or 70° 54′ 00″ W.",
    title: "The name of the series in the Catalog pane.",
  });
  for (const sentence of Object.values(ABOUT_SERIES)) {
    expect(sentence.endsWith(".")).toBe(true);
    // A full stop followed by a space and a capital letter would start a second sentence.
    expect(sentence).not.toMatch(/\. [A-Z]/);
  }
});

test.each(SERIES_TOOLS)("the i of the pane of %s states what the tool shows, in the words of its sheet", (tool) => {
  show(tool);
  const pane = screen.getByRole("complementary", { name: METHODS[tool].title });
  expect(pane.textContent).toContain(rowOf(METHODS[tool], "What it shows"));
});

test.each(SERIES_TOOLS)(
  "without two layers that it reads together, the pane of %s names the layers to get",
  async (tool) => {
    show(tool, [term(), coherence()]);
    expect(screen.getByText("No layers to use")).toBeDefined();
    expect(screen.getByText(RECEIVE_SERIES[tool])).toBeDefined();
    expect(missing()).toBe(NO_LAYERS);
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByLabelText("Series name")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
    expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
    await userEvent.click(runButton());
    expect(server.sent("POST")).toEqual([]);
  },
);

test("the form offers the layers of the series by date, chooses them all and proposes a name", () => {
  show("backscatter-series", [...THREE, coherence()]);
  expect(boxes()).toEqual([
    ["Backscatter HH, 27 Sep 2026", true],
    ["Backscatter HH, 21 Oct 2026", true],
    ["Backscatter HH, 2 Nov 2026", true],
  ]);
  expect(screen.getByLabelText<HTMLInputElement>("Series name").value).toBe(
    "Series of backscatter HH in dB, 27 Sep 2026 to 2 Nov 2026",
  );
  expect(screen.getByLabelText<HTMLInputElement>("Whole area").checked).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("At a point").checked).toBe(false);
  expect(missing()).toBeNull();
  // One group of layers needs no choice of the layer, and a series has no server to choose and no box for the map.
  expect(screen.queryByLabelText("Layer")).toBeNull();
  expect(screen.queryByLabelText("Server")).toBeNull();
  expect(screen.queryByLabelText("Add to the map when ready")).toBeNull();
  expect(screen.queryByLabelText("Latitude")).toBeNull();
});

test("a series of the whole area is started as a job with the layers in the order of their dates", async () => {
  show("backscatter-series", THREE);
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/backscatter-series/execution",
      content: {
        inputs: {
          inputs: ["hh-sep", "hh-oct", "hh-nov"],
          title: "Series of backscatter HH in dB, 27 Sep 2026 to 2 Nov 2026",
        },
      },
    },
  ]);
  expect(dockStore.get().tools).toContain("backscatter-series");
});

test("fewer than two layers are refused at the foot and, after the group was left, under the group", async () => {
  show("backscatter-series", THREE);
  await userEvent.click(screen.getByLabelText("Backscatter HH, 27 Sep 2026"));
  expect(screen.getByLabelText<HTMLInputElement>("Series name").value).toBe(
    "Series of backscatter HH in dB, 21 Oct 2026 to 2 Nov 2026",
  );
  expect(missing()).toBeNull();
  await userEvent.click(screen.getByLabelText("Backscatter HH, 2 Nov 2026"));
  expect(missing()).toBe("Choose at least two layers.");
  await userEvent.tab();
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe("Choose at least two layers.");
  const group = screen.getByRole("group", { name: "Layers of the series" });
  expect(group.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("a series at a point takes its latitude and longitude in degrees and sends the point", async () => {
  show("backscatter-series", THREE);
  await userEvent.click(screen.getByLabelText("At a point"));
  expect(missing()).toBe(ANGLE_FAULTS.latitude);
  await userEvent.type(screen.getByLabelText("Latitude"), "95");
  await userEvent.tab();
  expect(screen.getByRole("alert").textContent).toBe(ANGLE_FAULTS.latitude);
  expect(screen.getByLabelText("Latitude").getAttribute("aria-invalid")).toBe("true");
  await userEvent.clear(screen.getByLabelText("Latitude"));
  await userEvent.type(screen.getByLabelText("Latitude"), "42° 48′ N");
  expect(missing()).toBe(ANGLE_FAULTS.longitude);
  await userEvent.type(screen.getByLabelText("Longitude"), "-70.9");
  expect(missing()).toBeNull();
  await userEvent.click(runButton());
  expect(server.sent("POST")[0]?.content).toEqual({
    inputs: {
      inputs: ["hh-sep", "hh-oct", "hh-nov"],
      title: "Series of backscatter HH in dB, 27 Sep 2026 to 2 Nov 2026",
      point: { longitude: -70.9, latitude: 42.8 },
    },
  });
});

test("the name of the series can be typed, and an empty name is refused", async () => {
  show("backscatter-series", THREE);
  const name = screen.getByLabelText<HTMLInputElement>("Series name");
  await userEvent.clear(name);
  expect(missing()).toBe("Give a name.");
  await userEvent.tab();
  expect(screen.getByRole("alert").textContent).toBe("Give a name.");
  await userEvent.type(name, "Backscatter of the estuary");
  await userEvent.click(runButton());
  expect(server.sent("POST")[0]?.content).toMatchObject({ inputs: { title: "Backscatter of the estuary" } });
});

test("with layers of two kinds that cannot stand in one series, the field Layer chooses the group", async () => {
  const cross = [
    term({ id: "hv-oct", title: "Backscatter HV, 21 Oct 2026", layer: "HVHV" }),
    laterTerm({ id: "hv-nov", title: "Backscatter HV, 2 Nov 2026", layer: "HVHV" }),
  ];
  show("backscatter-series", [...THREE, ...cross]);
  const layer = screen.getByLabelText<HTMLSelectElement>("Layer");
  expect(
    within(layer)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual([
    "HHHH, track 141, frame 67, descending, release P05",
    "HVHV, track 141, frame 67, descending, release P05",
  ]);
  expect(boxes()).toHaveLength(3);
  await userEvent.click(screen.getByLabelText("Backscatter HH, 27 Sep 2026"));
  await userEvent.selectOptions(layer, "HVHV, track 141, frame 67, descending, release P05");
  expect(boxes()).toEqual([
    ["Backscatter HV, 21 Oct 2026", true],
    ["Backscatter HV, 2 Nov 2026", true],
  ]);
  expect(screen.getByLabelText<HTMLInputElement>("Series name").value).toBe(
    "Series of backscatter HV in dB, 21 Oct 2026 to 2 Nov 2026",
  );
  await userEvent.click(runButton());
  expect(server.sent("POST")[0]?.content).toMatchObject({ inputs: { inputs: ["hv-oct", "hv-nov"] } });
});

test("layers that an own server keeps are not offered, and the pane says why", () => {
  show("backscatter-series", THREE, { id: "0123456789abcdef", name: "Office computer" });
  expect(screen.getByText("No layers to use")).toBeDefined();
  expect(screen.getByText(ownServerSentence(3))).toBeDefined();
  expect(ownServerSentence(1)).toBe(
    "1 layer is kept on your server and cannot be used. A series is computed on the project server, so get the layer there.",
  );
  expect(ownServerSentence(3)).toBe(
    "3 layers are kept on your servers and cannot be used. A series is computed on the project server, so get the layers there.",
  );
});

test("the link Method opens the page Methods at the tool", async () => {
  show("coherence-series");
  await userEvent.click(screen.getByRole("button", { name: "Method" }));
  expect(methodsStore.get()).toEqual({ open: true, tool: "coherence-series" });
});

test("the foot follows the job: its start, its progress, a refusal, and the series with the link that shows it", () => {
  expect(seriesRunOf(null, [])).toBeNull();
  expect(seriesRunOf({ id: null, sending: true, fault: null, cancelled: false }, [])).toEqual({
    state: "running",
    text: "Starting the job",
  });
  const fault = "A session holds at most 50 series. Remove a series and try again.";
  expect(seriesRunOf({ id: null, sending: false, fault, cancelled: false }, [])).toEqual({
    state: "error",
    text: fault,
  });
  const running = job({
    jobID: "job-1",
    status: "running",
    message: "Reading the layer of 21 Oct 2026.",
    progress: 40,
  });
  expect(seriesRunOf(STARTED, [running])).toEqual({
    state: "running",
    progress: 0.4,
    text: "Running. Reading the layer of 21 Oct 2026.",
  });
  const refused = job({ jobID: "job-1", status: "failed", message: "The point lies outside the area of the layers." });
  expect(seriesRunOf(STARTED, [refused])).toMatchObject({
    state: "error",
    text: "The point lies outside the area of the layers.",
  });
  expect(seriesRunOf({ ...STARTED, cancelled: true }, [])).toEqual({
    state: "warning",
    text: "The job was cancelled.",
  });
  expect(seriesRunOf(STARTED, [])).toEqual({ state: "warning", text: "The job is no longer in the list of jobs." });
  const done = job({
    jobID: "job-1",
    status: "successful",
    message: "The series is ready.",
    progress: 100,
    series: "s-1",
  });
  const unread = seriesRunOf(STARTED, [done]);
  expect(unread).toMatchObject({
    state: "success",
    text: "The series is ready. It is under Series in the Catalog pane.",
  });
  expect(unread && "action" in unread ? unread.action?.label : null).toBe("Show the Catalog pane");
  const read = seriesRunOf(STARTED, [done], new Set(["s-1"]));
  expect(read && "action" in read ? read.action?.label : null).toBe("Show the series");
  if (read && "action" in read) {
    read.action?.onClick();
  }
  expect(shownSeriesStore.get()).toBe("s-1");
  expect(dockStore.get().tools).toContain(SERIES_PANE);
});

test("a job that the form started is followed to its end, and the foot offers the series", async () => {
  show("backscatter-series", THREE);
  await userEvent.click(runButton());
  const [started] = jobsStore.get();
  expect(started?.processID).toBe("backscatter-series");
  server.change("job-1", { status: "running", message: "Reading the layer of 27 Sep 2026.", progress: 30 });
  await act(() => loadJobs());
  expect(screen.getByText("Running. Reading the layer of 27 Sep 2026. (30 %)")).toBeDefined();
  server.series = [seriesItem()];
  server.change("job-1", { status: "successful", message: "The series is ready.", progress: 100, series: series().id });
  await act(async () => {
    await loadJobs();
    await loadSeries();
  });
  expect(screen.getByText("The series is ready. It is under Series in the Catalog pane.")).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Show the series" }));
  expect(shownSeriesStore.get()).toBe(series().id);
});

/** The layers Unwrapped phase and Connected components of two pairs of the pilot area. */
const PHASE_SEP = phase({
  id: "phase-sep",
  title: "Unwrapped phase HH, 27 Sep 2026 to 9 Oct 2026",
  dates: ["2026-09-27", "2026-10-09"],
  inputs: [GUNW_SEP],
});
const LABELS_SEP = components({
  id: "labels-sep",
  title: "Connected components HH, 27 Sep 2026 to 9 Oct 2026",
  dates: ["2026-09-27", "2026-10-09"],
  inputs: [GUNW_SEP],
});

test("the explanations of the form of Surface displacement, Series are one sentence each", () => {
  for (const sentence of Object.values(ABOUT_RELATIVE)) {
    expect(sentence.endsWith(".")).toBe(true);
    expect(sentence).not.toMatch(/\. [A-Z]/);
  }
  expect(RECEIVE_SERIES["displacement-series"]).toBe(
    "Get the Unwrapped phase and Connected components layers of two or more GUNW pairs of one track and frame.",
  );
});

test("the form of Surface displacement, Series takes the pairs, a point and a reference point, and has no place", async () => {
  show("displacement-series", [phase(), components(), PHASE_SEP, LABELS_SEP]);
  expect(boxes()).toEqual([
    ["Unwrapped phase HH, 27 Sep 2026 to 9 Oct 2026", true],
    ["Unwrapped phase HH, 9 Oct 2026 to 21 Oct 2026", true],
  ]);
  expect(screen.queryByLabelText("Whole area")).toBeNull();
  expect(screen.queryByLabelText("At a point")).toBeNull();
  const title = "Series of surface displacement HH, 27 Sep 2026 to 21 Oct 2026";
  expect(screen.getByLabelText<HTMLInputElement>("Series name").value).toBe(title);
  expect(missing()).toBe(ANGLE_FAULTS.latitude);
  await userEvent.type(screen.getByLabelText("Latitude"), "42.8126");
  await userEvent.type(screen.getByLabelText("Longitude"), "-70.8726");
  // The reference point is still missing.
  expect(missing()).toBe(REFERENCE_FAULTS.latitude);
  await userEvent.type(screen.getByLabelText("Reference latitude"), "42.7761");
  await userEvent.type(screen.getByLabelText("Reference longitude"), "71.0772 W");
  expect(missing()).toBeNull();
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/displacement-series/execution",
      content: {
        inputs: {
          inputs: ["phase-sep", "labels-sep", "phase-hh", "components-hh"],
          title,
          point: { longitude: -70.8726, latitude: 42.8126 },
          reference: { longitude: -71.0772, latitude: 42.7761 },
        },
      },
    },
  ]);
});

test("the form of Surface displacement, Series states a pair whose Connected components layer is missing", () => {
  show("displacement-series", [phase(), PHASE_SEP, LABELS_SEP]);
  expect(missing()).toBe(noComponentsSentence(phase()));
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
});
