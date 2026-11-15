import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addWhenReadyStore } from "../data/follow";
import { jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { GET_LAYER_PANE } from "../data/state";
import { job, standIn, type StandIn } from "../data/testSession";
import { methodsStore } from "../help/state";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { resetPanes } from "../shared/panes";
import { AnalysisDialogs } from "./AnalysisDialogs";
import { plain } from "./Marked";
import { readingOf, referenceOf, summaryOf } from "./methods";
import { METHODS } from "./methodSheets";
import { coherence, GCOV_NOV, laterTerm, term } from "./testLayers";
import { ABOUT, RECEIVE, runOf, ToolForm, unnamedSentence, type Started } from "./ToolForm";
import { FINISHED_TOOLS, NO_PARTNER, type FinishedTool } from "./tools";

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
  server = standIn();
});

afterEach(() => {
  resetJobs();
  resetLayers();
  vi.unstubAllGlobals();
});

/** Show the form of a tool, open, in a session that holds the given layers. */
function show(tool: FinishedTool, layers: readonly LayerDescription[] = []) {
  layersStore.set(layers.map((layer) => ({ layer, size: null, created: null })));
  openToolPane(tool);
  render(<ToolForm tool={tool} />);
}

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

test("the foot states that the result was computed, and where it is", () => {
  const done = job({
    jobID: "job-1",
    status: "successful",
    message: "The result is ready.",
    progress: 100,
    layer: "result-1",
  });
  const listed = runOf(STARTED, [done]);
  expect(listed).toMatchObject({ state: "success", text: "The result was computed. The Catalog pane lists it." });
  expect(listed && "action" in listed ? listed.action?.label : null).toBe("Show the Catalog pane");
  expect(runOf(STARTED, [done], new Set(["result-1"]))).toMatchObject({
    state: "success",
    text: "The result was computed. It is on the map and in the Catalog pane.",
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

test("every explanation of the form has at most three sentences", () => {
  for (const text of Object.values(ABOUT)) {
    expect(text.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(3);
    expect(text.endsWith(".")).toBe(true);
  }
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
  "without a layer that %s reads, the pane names the layer to receive and offers Get layer",
  async (tool) => {
    show(tool, tool === "coherence-state" ? [term()] : [coherence()]);
    expect(screen.getByText("No input layer")).toBeDefined();
    expect(screen.getAllByText(RECEIVE[tool])).toHaveLength(2);
    expect(screen.queryByLabelText("Name of the result")).toBeNull();
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(runButton());
    expect(server.sent("POST")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
    expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
  },
);

test("the layer to receive is named as the Get layer form names it", () => {
  expect(RECEIVE).toEqual({
    "backscatter-state": "Receive a layer Backscatter of a GCOV product with Get layer.",
    "backscatter-change":
      "Receive a layer Backscatter of two GCOV products of the same track, direction and frame with Get layer.",
    "coherence-state": "Receive a layer Coherence of a GUNW product with Get layer.",
  });
});

test("the field Input layer offers the layers that the tool reads, and no other", () => {
  show("backscatter-state", [
    laterTerm(),
    term(),
    coherence(),
    term({ id: "looks", title: "Number of looks", layer: "numberOfLooks" }),
  ]);
  expect(options("Input layer")).toEqual([
    "Select a layer",
    "Backscatter HH, 2 Nov 2026 (track 141, frame 67, descending)",
    "Backscatter HH, 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
});

test("Coherence, One pair offers the coherence layers of the session", () => {
  show("coherence-state", [term(), coherence()]);
  expect(options("Input layer")).toEqual([
    "Select a layer",
    "Coherence HH, 80 m, 9 Oct 2026 to 21 Oct 2026 (track 141, frame 67, descending)",
  ]);
});

test("while no layer is chosen, the foot states it and the run button is inactive", async () => {
  show("backscatter-state", [term()]);
  expect(screen.getByText("Choose the input layer.")).toBeDefined();
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("the form proposes the name of the result from the chosen layer, until the visitor changes the name", async () => {
  show("backscatter-state", [term(), laterTerm()]);
  const name = screen.getByLabelText<HTMLInputElement>("Name of the result");
  expect(name.value).toBe("");
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
  expect(name.value).toBe("Backscatter HH in dB, 21 Oct 2026");
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-nov");
  expect(name.value).toBe("Backscatter HH in dB, 2 Nov 2026");
  await userEvent.clear(name);
  await userEvent.type(name, "My result");
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
  expect(name.value).toBe("My result");
});

test("a tool of one input starts as a job of the process of its name, with the layer and the name of the result", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
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
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "coherence-80");
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

test("the second field of Backscatter, Change is inactive until the first layer is chosen", async () => {
  show("backscatter-change", [term(), laterTerm()]);
  expect(screen.getByLabelText<HTMLSelectElement>("Second layer").disabled).toBe(true);
  expect(screen.getByText("Choose the first layer.")).toBeDefined();
  await userEvent.selectOptions(screen.getByLabelText("First layer"), "hh-oct");
  expect(screen.getByLabelText<HTMLSelectElement>("Second layer").disabled).toBe(false);
  expect(screen.getByText("Choose the second layer.")).toBeDefined();
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
  expect(options("First layer")).toHaveLength(7);
  await userEvent.selectOptions(screen.getByLabelText("First layer"), "hh-oct");
  expect(options("Second layer")).toEqual([
    "Select a layer",
    "Backscatter HH, 2 Nov 2026 (track 141, frame 67, descending)",
  ]);
  await userEvent.selectOptions(screen.getByLabelText("First layer"), "hv-nov");
  expect(options("Second layer")).toEqual(["Select a layer"]);
});

test.each([
  ["hh-oct", "hh-nov"],
  ["hh-nov", "hh-oct"],
])("Backscatter, Change sends the layer of the earlier date first (fields %s and %s)", async (first, second) => {
  show("backscatter-change", [laterTerm(), term()]);
  await userEvent.selectOptions(screen.getByLabelText("First layer"), first);
  await userEvent.selectOptions(screen.getByLabelText("Second layer"), second);
  expect(valueOf(document.body, "Earlier date")).toBe("21 Oct 2026");
  expect(valueOf(document.body, "Later date")).toBe("2 Nov 2026");
  expect(screen.getByLabelText<HTMLInputElement>("Name of the result").value).toBe(
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
  await userEvent.selectOptions(screen.getByLabelText("First layer"), "hh-oct");
  await userEvent.selectOptions(screen.getByLabelText("Second layer"), "again");
  await userEvent.tab();
  const sentence = "The two layers have the same date. Choose a layer of another date.";
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(sentence);
  const field = screen.getByLabelText("Second layer");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(screen.getAllByText(sentence)).toHaveLength(2);
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("a first layer without a matching layer is stated, with the way to the Get layer form", async () => {
  show("backscatter-change", [term(), laterTerm({ layer: "HVHV" })]);
  await userEvent.selectOptions(screen.getByLabelText("First layer"), "hh-oct");
  expect(screen.getByLabelText<HTMLSelectElement>("Second layer").disabled).toBe(true);
  expect(
    screen.getByText(
      `${NO_PARTNER} Receive the same layer of a product of another date, of the same track, direction and frame.`,
    ),
  ).toBeDefined();
  expect(screen.getAllByText(NO_PARTNER, { exact: false })).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toContain(GET_LAYER_PANE);
});

test("an empty name of the result is refused at its field after the field is left", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
  const name = screen.getByLabelText("Name of the result");
  await userEvent.clear(name);
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.tab();
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe("Give the name of the result.");
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(name.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(runButton().getAttribute("aria-disabled")).toBe("true");
  await userEvent.type(name, "Decibels");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(runButton().getAttribute("aria-disabled")).toBeNull();
});

test("layers that do not record which layer of their product they are, are counted, with what to do", () => {
  expect(unnamedSentence(1)).toBe(
    "1 layer of the session does not record which layer of its product it is, so the tool does not read it. Receive it again with Get layer.",
  );
  expect(unnamedSentence(2)).toBe(
    "2 layers of the session do not record which layer of their product they are, so the tool does not read them. Receive them again with Get layer.",
  );
  show("backscatter-state", [term({ layer: null }), term({ id: "older", layer: undefined }), laterTerm()]);
  expect(options("Input layer")).toEqual([
    "Select a layer",
    "Backscatter HH, 2 Nov 2026 (track 141, frame 67, descending)",
  ]);
  expect(screen.getByText(unnamedSentence(2))).toBeDefined();
});

test("a refusal of the request is shown in the sentence of the server", async () => {
  const sentence = "Your session holds as many layers as it may. Remove a layer and try again.";
  server.refuse("POST", "/api/processes/backscatter-state/execution", 507, sentence);
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
  await userEvent.click(runButton());
  expect(screen.getByRole("alert").textContent).toBe(sentence);
  expect(jobsStore.get()).toEqual([]);
});

test("the refusal of a tool is shown in the sentence of the server when its job has failed", async () => {
  show("backscatter-change", [term(), laterTerm()]);
  await userEvent.selectOptions(screen.getByLabelText("First layer"), "hh-oct");
  await userEvent.selectOptions(screen.getByLabelText("Second layer"), "hh-nov");
  await userEvent.click(runButton());
  const sentence = "The layers of the analysis do not have the same grid.";
  server.change("job-1", { status: "failed", message: sentence, progress: 0 });
  await act(loadJobs);
  expect(screen.getByRole("alert").textContent).toBe(sentence);
});

test("a finished job is stated at the foot, with the link to the Catalog pane", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
  await userEvent.click(runButton());
  server.change("job-1", { status: "successful", message: "The result is ready.", progress: 100, layer: "result-1" });
  await act(loadJobs);
  expect(screen.getByText("The result was computed. The Catalog pane lists it.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Show the Catalog pane" })).toBeDefined();
  expect(screen.getByRole("button", { name: "View details" })).toBeDefined();
});

test("a job that waits can be cancelled from the form", async () => {
  show("backscatter-state", [term()]);
  await userEvent.selectOptions(screen.getByLabelText("Input layer"), "hh-oct");
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

test.each(FINISHED_TOOLS)(
  "the form of %s shows the result, the reference and the mask statement of its sheet",
  (tool) => {
    show(tool);
    const method = METHODS[tool];
    const section = screen.getByRole("group", { name: "Method" });
    expect(valueOf(section, "Result")).toBe(plain(summaryOf(method, "Result")));
    expect(valueOf(section, "Reference")).toBe(plain(referenceOf(method)));
    expect(valueOf(section, "Mask")).toBe(plain(method.mask));
    expect(section.textContent).toContain(plain(readingOf(method)));
    expect(within(section).getByRole("button", { name: "Information about Result" })).toBeDefined();
  },
);

test("the link of the section Method opens the method sheet of the tool in the Help tab", async () => {
  show("backscatter-change");
  await userEvent.click(screen.getByRole("button", { name: "Show the method sheet" }));
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
