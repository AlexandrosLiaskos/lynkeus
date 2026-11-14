import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsFaultStore, jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { loadLayers, resetLayers } from "../data/layers";
import { job, layer, standIn, type StandIn } from "../data/testSession";
import { messagesStore } from "../shared/messages/messages";
import { JobsSection, jobsSentence } from "./JobsSection";
import { openLayerStore } from "./state";

let server: StandIn;

const RUNNING = job({ jobID: "run", title: "Backscatter HH, 21 Oct 2026", created: "2026-11-14T16:20:00Z" });
const WAITING = job({
  jobID: "wait",
  title: "Coherence HH, 9 and 21 Oct 2026",
  status: "accepted",
  message: "The job waits for its turn.",
  created: "2026-11-14T16:21:00Z",
  started: undefined,
  progress: 0,
});
const FINISHED = job({
  jobID: "done",
  title: "Soil moisture, 2 Nov 2026",
  status: "successful",
  message: "The layer is ready.",
  created: "2026-11-14T16:00:00Z",
  started: "2026-11-14T16:00:02Z",
  finished: "2026-11-14T16:02:07Z",
  progress: 100,
  layer: "made",
});
const FAILED = job({
  jobID: "fail",
  title: "Azimuth offset, 9 and 21 Oct 2026",
  status: "failed",
  message: "The area lies outside the product.",
  created: "2026-11-14T16:10:00Z",
  started: "2026-11-14T16:10:01Z",
  finished: "2026-11-14T16:10:04Z",
});

beforeEach(() => {
  resetJobs();
  resetLayers();
  openLayerStore.set(null);
  messagesStore.set([]);
  server = standIn();
});

afterEach(() => {
  resetJobs();
  vi.unstubAllGlobals();
});

async function show(jobs = [WAITING, RUNNING, FAILED, FINISHED]) {
  server.jobs = jobs;
  render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <JobsSection />
    </>,
  );
  await act(() => loadJobs());
}

const item = (name: RegExp) => screen.getByRole("button", { name });
const titles = () =>
  screen.getAllByRole("button", { expanded: false }).map((button) => button.firstChild?.textContent?.trim());
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

/** Show the tools of a job and return their group. */
async function toolsOf(name: RegExp, title: string) {
  await userEvent.click(item(name));
  return within(screen.getByRole("group", { name: `Tools of the job ${title}` }));
}

test("the section is not shown while the session has no job", () => {
  render(<JobsSection />);
  expect(screen.queryByRole("region")).toBeNull();
  expect(screen.queryByRole("heading")).toBeNull();
});

test("each job shows its name, its state in words, its time and the sentence of the server", async () => {
  await show();
  expect(screen.getByRole("region", { name: "Jobs" })).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe("4 jobs: 1 running, 1 waiting, 1 finished, 1 failed.");
  expect(screen.getAllByRole("listitem").map((row) => row.querySelector("button")?.textContent)).toEqual([
    " Coherence HH, 9 and 21 Oct 2026Waiting, 0 %Requested 14 Nov 2026, 16:21:00 UTCThe job waits for its turn.",
    " Backscatter HH, 21 Oct 2026Running, 40 %Requested 14 Nov 2026, 16:20:00 UTC, after 1 min 5 s of workNASA Harmony is preparing the layer.",
    " Azimuth offset, 9 and 21 Oct 2026FailedEnded 14 Nov 2026, 16:10:04 UTC, after 3 s of workThe area lies outside the product.",
    " Soil moisture, 2 Nov 2026FinishedEnded 14 Nov 2026, 16:02:07 UTC, after 2 min 5 s of work",
  ]);
});

test("a job that waits or runs shows its progress", async () => {
  await show();
  const bars = screen.getAllByRole<HTMLProgressElement>("progressbar");
  expect(bars.map((bar) => [bar.getAttribute("aria-label"), bar.value])).toEqual([
    ["Progress of Coherence HH, 9 and 21 Oct 2026", 0],
    ["Progress of Backscatter HH, 21 Oct 2026", 40],
  ]);
  server.change("run", { progress: 75 });
  await act(() => loadJobs());
  expect(screen.getAllByRole<HTMLProgressElement>("progressbar")[1]?.value).toBe(75);
});

test("the sentence of the section counts the jobs by their state", () => {
  expect(jobsSentence([RUNNING])).toBe("1 job: 1 running.");
  expect(jobsSentence([FINISHED, FINISHED, FAILED])).toBe("3 jobs: 2 finished, 1 failed.");
});

test("a click on a job shows its tools, and a second click hides them", async () => {
  await show();
  expect(screen.queryByRole("group")).toBeNull();
  const running = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  expect(running.getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel", "Details"]);
  const failed = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  expect(failed.getAllByRole("button").map((button) => button.textContent)).toEqual(["Details", "Run again", "Remove"]);
  expect(screen.getAllByRole("group")).toHaveLength(1);
  await userEvent.click(item(/^Azimuth offset/));
  expect(screen.queryByRole("group")).toBeNull();
});

test("a waiting or running job is cancelled, and the visitor is told", async () => {
  await show();
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Cancel" }));
  await vi.waitFor(() => expect(jobsStore.get().map(({ jobID }) => jobID)).toEqual(["wait", "fail", "done"]));
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual(["/api/jobs/run"]);
  expect(messages()).toEqual([["info", 'The job "Backscatter HH, 21 Oct 2026" was cancelled.']]);
  expect(screen.queryByRole("button", { name: /^Backscatter HH/ })).toBeNull();
});

test("the details show every field of a job, with its inputs", async () => {
  await show();
  const tools = await toolsOf(/^Soil moisture/, "Soil moisture, 2 Nov 2026");
  await userEvent.click(tools.getByRole("button", { name: "Details" }));
  const dialog = within(screen.getByRole("dialog", { name: "Job: Soil moisture, 2 Nov 2026" }));
  expect(dialog.getAllByRole("row").map((row) => row.textContent)).toEqual([
    "NameSoil moisture, 2 Nov 2026",
    "Processget-layer",
    "StatusFinished",
    "MessageThe layer is ready.",
    "Requested14 Nov 2026, 16:00:00 UTC",
    "Started14 Nov 2026, 16:00:02 UTC",
    "Ended14 Nov 2026, 16:02:07 UTC",
    "Time of the work2 min 5 s",
    "Product typeGCOV",
    "Product fileNISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001",
    "Layer of the productHHHH",
    "AreaWest -71.2, south 42.6, east -70.75, north 42.95 (degrees)",
    "Identifier of the layermade",
    "Identifier of the jobdone",
  ]);
});

test("a finished job is run again with the same inputs", async () => {
  await show();
  const tools = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Run again" }));
  await vi.waitFor(() => expect(jobsStore.get()).toHaveLength(5));
  expect(server.sent("POST")).toEqual([
    { method: "POST", address: "/api/processes/get-layer/execution", content: { inputs: FAILED.inputs } },
  ]);
  expect(jobsStore.get()[0]?.status).toBe("accepted");
  expect(messages()).toEqual([["info", 'The job "Azimuth offset, 9 and 21 Oct 2026" was started again.']]);
});

test("a limit of the server on a new run is reported in its words", async () => {
  await show();
  server.refuse(
    "POST",
    "/api/processes",
    429,
    "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish.",
  );
  const tools = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Run again" }));
  await vi.waitFor(() =>
    expect(messages()).toEqual([
      ["error", "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish."],
    ]),
  );
});

test("a job whose inputs the server does not state cannot be run again", async () => {
  await show([{ ...FAILED, inputs: undefined }]);
  const tools = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  expect(tools.queryByRole("button", { name: "Run again" })).toBeNull();
});

test("the record of a finished job is removed, and the keyboard focus goes to the heading", async () => {
  await show();
  const tools = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Remove" }));
  await vi.waitFor(() => expect(jobsStore.get()).toHaveLength(3));
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual(["/api/jobs/fail"]);
  expect(messages()).toEqual([]);
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Jobs" })));
});

test("the last job leaves with its section, and the keyboard focus goes to the map", async () => {
  await show([FAILED]);
  const tools = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Remove" }));
  await vi.waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("main")));
});

test("the button Remove finished removes the records of all finished jobs", async () => {
  await show();
  await userEvent.click(screen.getByRole("button", { name: "Remove finished" }));
  await vi.waitFor(() => expect(jobsStore.get().map(({ jobID }) => jobID)).toEqual(["wait", "run"]));
  expect(messages()).toEqual([["info", "The records of 2 jobs were removed."]]);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Remove finished" }).disabled).toBe(true);
});

test("a successful job leads to its layer in the list of layers", async () => {
  server.layers = [{ layer: layer({ id: "made" }) }];
  await loadLayers();
  await show();
  const tools = await toolsOf(/^Soil moisture/, "Soil moisture, 2 Nov 2026");
  await userEvent.click(tools.getByRole("button", { name: "Show layer" }));
  expect(openLayerStore.get()).toBe("made");
  const other = await toolsOf(/^Azimuth offset/, "Azimuth offset, 9 and 21 Oct 2026");
  expect(other.queryByRole("button", { name: "Show layer" })).toBeNull();
});

test("the list is sorted and a part of it is shown alone", async () => {
  await show();
  const names = () => titles().map((title) => title?.split(",")[0]);
  expect(names()).toEqual(["Coherence HH", "Backscatter HH", "Azimuth offset", "Soil moisture"]);
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "Name");
  expect(names()).toEqual(["Azimuth offset", "Backscatter HH", "Coherence HH", "Soil moisture"]);
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "Status");
  expect(names()).toEqual(["Backscatter HH", "Coherence HH", "Azimuth offset", "Soil moisture"]);
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "Start, earliest first");
  expect(names()).toEqual(["Soil moisture", "Azimuth offset", "Backscatter HH", "Coherence HH"]);
  await userEvent.selectOptions(screen.getByLabelText("Show"), "Waiting and running");
  expect(names()).toEqual(["Backscatter HH", "Coherence HH"]);
  await userEvent.selectOptions(screen.getByLabelText("Show"), "Failed");
  expect(names()).toEqual(["Azimuth offset"]);
});

test("a part of the list without a job says so", async () => {
  await show([RUNNING]);
  await userEvent.selectOptions(screen.getByLabelText("Show"), "Failed");
  expect(screen.getByText("No job of the list is in this state.")).toBeDefined();
});

test("a reading that failed is stated, with a button that reads again", async () => {
  server.refuse(
    "GET",
    "/api/jobs",
    503,
    "The web service of Lynkeus does not answer at present. Try again in a minute.",
  );
  await show([RUNNING]);
  expect(screen.getByRole("alert").textContent).toMatch(/^The web service of Lynkeus does not answer at present\./);
  expect(screen.queryByRole("list")).toBeNull();
  server.accept();
  await userEvent.click(screen.getByRole("button", { name: "Read again" }));
  await vi.waitFor(() => expect(jobsFaultStore.get()).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(item(/^Backscatter HH/)).toBeDefined();
});

test("a job is cancelled with the keyboard alone", async () => {
  await show([RUNNING]);
  item(/^Backscatter HH/).focus();
  await userEvent.keyboard("{Enter}");
  expect(item(/^Backscatter HH/).getAttribute("aria-expanded")).toBe("true");
  await userEvent.tab();
  expect(document.activeElement?.textContent).toBe("Cancel");
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(jobsStore.get()).toEqual([]));
});
