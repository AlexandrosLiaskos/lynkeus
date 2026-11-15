import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsFaultStore, jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { loadLayers, resetLayers } from "../data/layers";
import { job, layer, standIn, type StandIn } from "../data/testSession";
import { LABORATORY, OFFICE, OFFICE_NAME, SERVERS } from "../servers/testServers";
import { messagesStore } from "../shared/messages/messages";
import { serversStore } from "../shared/servers";
import { jobGroups } from "./details";
import { awayWords, JobsSection, jobsSentence, noteWords, serverWords, stateWords } from "./JobsSection";
import { layersOpenStore, markedLayerStore } from "./state";

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
  serversStore.set(null);
  markedLayerStore.set(null);
  layersOpenStore.set(true);
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

/** The names of the jobs of the list, in their order, up to the first comma. */
const names = () =>
  [...document.querySelectorAll(".job .item-title")].map((title) => title.textContent.trim().split(",")[0]);
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

/** The commands of a job: the one that the item shows and the button of the menu "More". */
const commandsOf = (title: string) => within(screen.getByRole("group", { name: `Commands of the job ${title}` }));

/** Open the menu "More" of a job and return the names of its commands. */
async function moreOf(title: string): Promise<string[]> {
  await userEvent.click(commandsOf(title).getByRole("button", { name: `More commands of ${title}` }));
  return screen.getAllByRole("menuitem").map((command) => command.textContent);
}

/** Choose a command of a menu that is open. */
const choose = (command: string) => userEvent.click(within(screen.getByRole("menu")).getByText(command));

test("without a job the section says how it fills", () => {
  render(<JobsSection />);
  expect(screen.getByRole("button", { name: "Jobs (0)" })).toBeDefined();
  expect(screen.getByText("A job starts when a layer is requested or an analysis tool is run.")).toBeDefined();
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(screen.queryByRole("list")).toBeNull();
});

test("each job shows its name, its state in words and one line about it", async () => {
  await show();
  expect(screen.getByRole("button", { name: "Jobs (4)", expanded: true })).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe("1 running, 1 waiting, 1 finished, 1 failed.");
  expect([...document.querySelectorAll(".job .item-main")].map((text) => text.textContent.trim())).toEqual([
    "Coherence HH, 9 and 21 Oct 2026Waiting, 0 %The job waits for its turn.",
    "Backscatter HH, 21 Oct 2026Running, 40 % after 1 min 5 sNASA Harmony is preparing the layer.",
    "Azimuth offset, 9 and 21 Oct 2026FailedThe area lies outside the product.",
    "Soil moisture, 2 Nov 2026FinishedEnded 14 Nov 2026, 16:02:07 UTC, after 2 min 5 s of work",
  ]);
});

test("the state and the line of a job are written from its status, its times and the sentence of the server", () => {
  expect(stateWords(WAITING)).toBe("Waiting, 0 %");
  expect(stateWords(RUNNING)).toBe("Running, 40 % after 1 min 5 s");
  expect(stateWords(FAILED)).toBe("Failed");
  expect(noteWords({ ...WAITING, message: "" })).toBe("Requested 14 Nov 2026, 16:21:00 UTC");
  expect(noteWords({ ...FAILED, message: "" })).toBe("Ended 14 Nov 2026, 16:10:04 UTC, after 3 s of work");
  expect(noteWords(FINISHED)).toBe("Ended 14 Nov 2026, 16:02:07 UTC, after 2 min 5 s of work");
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

test("the line of the section counts the jobs by their state", () => {
  expect(jobsSentence([RUNNING])).toBe("1 running.");
  expect(jobsSentence([FINISHED, FINISHED, FAILED])).toBe("2 finished, 1 failed.");
});

test("a job shows the one command that fits its state, and its other commands in the menu More", async () => {
  server.layers = [{ layer: layer({ id: "made" }) }];
  await loadLayers();
  await show();
  const shown = (title: string) =>
    commandsOf(title)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);
  expect(shown("Backscatter HH, 21 Oct 2026")).toEqual(["Cancel", "More commands of Backscatter HH, 21 Oct 2026"]);
  expect(shown("Azimuth offset, 9 and 21 Oct 2026")).toEqual([
    "Run again",
    "More commands of Azimuth offset, 9 and 21 Oct 2026",
  ]);
  expect(shown("Soil moisture, 2 Nov 2026")).toEqual(["Show layer", "More commands of Soil moisture, 2 Nov 2026"]);
  expect(await moreOf("Backscatter HH, 21 Oct 2026")).toEqual(["Details"]);
  await userEvent.keyboard("{Escape}");
  expect(await moreOf("Azimuth offset, 9 and 21 Oct 2026")).toEqual(["Details", "Remove"]);
  await userEvent.keyboard("{Escape}");
  expect(await moreOf("Soil moisture, 2 Nov 2026")).toEqual(["Details", "Run again", "Remove"]);
});

test("a waiting or running job is cancelled, and the visitor is told", async () => {
  await show();
  await userEvent.click(commandsOf("Backscatter HH, 21 Oct 2026").getByRole("button", { name: "Cancel" }));
  await vi.waitFor(() => expect(jobsStore.get().map(({ jobID }) => jobID)).toEqual(["wait", "fail", "done"]));
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual(["/api/jobs/run"]);
  expect(messages()).toEqual([["info", 'The job "Backscatter HH, 21 Oct 2026" was cancelled.']]);
  expect(names()).not.toContain("Backscatter HH");
});

test("the details show every field of a job in groups, with its inputs", async () => {
  await show();
  await moreOf("Soil moisture, 2 Nov 2026");
  await choose("Details");
  const dialog = screen.getByRole("dialog", { name: "Job: Soil moisture, 2 Nov 2026" });
  expect([...dialog.querySelectorAll(".property-group-title")].map((title) => title.textContent)).toEqual([
    "Job",
    "Inputs",
    "Identifiers",
  ]);
  expect(
    [...dialog.querySelectorAll(".property-row")].map(
      (row) =>
        `${row.querySelector(".property-name")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
    ),
  ).toEqual([
    "Name: Soil moisture, 2 Nov 2026",
    "Process: get-layer",
    "Server: Project server",
    "Status: Finished",
    "Message: The layer is ready.",
    "Requested: 14 Nov 2026, 16:00:00 UTC",
    "Started: 14 Nov 2026, 16:00:02 UTC",
    "Ended: 14 Nov 2026, 16:02:07 UTC",
    "Time of the work: 2 min 5 s",
    "Product type: GCOV",
    "Product file: NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001",
    "Layer of the product: HHHH",
    "Area: West -71.2, south 42.6, east -70.75, north 42.95 (degrees)",
    "Identifier of the layer: made",
    "Identifier of the job: done",
  ]);
  expect(within(dialog).getByRole("button", { name: "Copy Identifier of the job" })).toBeDefined();
});

test("a job without inputs and without a layer has no such group", () => {
  const groups = jobGroups({ ...WAITING, inputs: undefined });
  expect(groups.map(({ title, rows }) => [title, rows.length])).toEqual([
    ["Job", 6],
    ["Identifiers", 1],
  ]);
  expect(groups[1]?.rows[0]).toEqual({ name: "Identifier of the job", value: "wait", copy: true });
});

test("a finished job is run again with the same inputs", async () => {
  await show();
  await userEvent.click(commandsOf("Azimuth offset, 9 and 21 Oct 2026").getByRole("button", { name: "Run again" }));
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
  await userEvent.click(commandsOf("Azimuth offset, 9 and 21 Oct 2026").getByRole("button", { name: "Run again" }));
  await vi.waitFor(() =>
    expect(messages()).toEqual([
      ["error", "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish."],
    ]),
  );
});

test("a job whose inputs the server does not state cannot be run again", async () => {
  await show([{ ...FAILED, inputs: undefined }]);
  expect(commandsOf("Azimuth offset, 9 and 21 Oct 2026").queryByRole("button", { name: "Run again" })).toBeNull();
  expect(await moreOf("Azimuth offset, 9 and 21 Oct 2026")).toEqual(["Details", "Remove"]);
});

test("the record of a finished job is removed, and the keyboard focus goes to the title of the section", async () => {
  await show();
  await moreOf("Azimuth offset, 9 and 21 Oct 2026");
  await choose("Remove");
  await vi.waitFor(() => expect(jobsStore.get()).toHaveLength(3));
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual(["/api/jobs/fail"]);
  expect(messages()).toEqual([]);
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Jobs (3)" })));
});

test("after the last job has left, the section says again how it fills", async () => {
  await show([FAILED]);
  await moreOf("Azimuth offset, 9 and 21 Oct 2026");
  await choose("Remove");
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Jobs (0)" })).toBeDefined());
  expect(screen.getByText("A job starts when a layer is requested or an analysis tool is run.")).toBeDefined();
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Jobs (0)" })));
});

test("the command Remove finished jobs removes the records of all finished jobs", async () => {
  await show();
  const remove = screen.getByRole("button", { name: "Remove finished jobs" });
  await userEvent.click(remove);
  await vi.waitFor(() => expect(jobsStore.get().map(({ jobID }) => jobID)).toEqual(["wait", "run"]));
  expect(messages()).toEqual([["info", "The records of 2 jobs were removed."]]);
  expect(screen.getByRole("button", { name: "Remove finished jobs" }).getAttribute("aria-disabled")).toBe("true");
});

test("a successful job leads to its layer in the list of layers", async () => {
  server.layers = [{ layer: layer({ id: "made" }) }];
  await loadLayers();
  layersOpenStore.set(false);
  await show();
  await userEvent.click(commandsOf("Soil moisture, 2 Nov 2026").getByRole("button", { name: "Show layer" }));
  expect(markedLayerStore.get()).toBe("made");
  expect(layersOpenStore.get()).toBe(true);
  expect(commandsOf("Azimuth offset, 9 and 21 Oct 2026").queryByRole("button", { name: "Show layer" })).toBeNull();
});

test("the header of the section sorts the list and shows a part of it alone", async () => {
  await show();
  const toolbar = within(screen.getByRole("toolbar", { name: "Commands of the list of jobs" }));
  expect(toolbar.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "Sort by",
    "Show",
    "Read again",
    "Remove finished jobs",
  ]);
  const pick = async (menu: string, command: string) => {
    await userEvent.click(toolbar.getByRole("button", { name: menu }));
    await choose(command);
  };
  expect(names()).toEqual(["Coherence HH", "Backscatter HH", "Azimuth offset", "Soil moisture"]);
  await pick("Sort by", "Name");
  expect(names()).toEqual(["Azimuth offset", "Backscatter HH", "Coherence HH", "Soil moisture"]);
  await pick("Sort by", "Status");
  expect(names()).toEqual(["Backscatter HH", "Coherence HH", "Azimuth offset", "Soil moisture"]);
  await pick("Sort by", "Start, earliest first");
  expect(names()).toEqual(["Soil moisture", "Azimuth offset", "Backscatter HH", "Coherence HH"]);
  await pick("Show", "Waiting and running");
  expect(names()).toEqual(["Backscatter HH", "Coherence HH"]);
  await pick("Show", "Failed");
  expect(names()).toEqual(["Azimuth offset"]);
  await userEvent.click(toolbar.getByRole("button", { name: "Show" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Failed" }).getAttribute("aria-checked")).toBe("true");
});

test("a part of the list without a job says so", async () => {
  await show([RUNNING]);
  await userEvent.click(screen.getByRole("button", { name: "Show" }));
  await choose("Failed");
  expect(screen.getByText("No job of the list is in this state.")).toBeDefined();
});

test("a reading that failed is stated in a notice, with a button that reads again", async () => {
  server.refuse(
    "GET",
    "/api/jobs",
    503,
    "The web service of Lynkeus does not answer at present. Try again in a minute.",
  );
  await show([RUNNING]);
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toBe("The web service of Lynkeus does not answer at present. Try again in a minute.");
  expect(screen.queryByRole("list")).toBeNull();
  server.accept();
  const notice = alert.closest<HTMLElement>(".notice");
  if (!notice) {
    throw new Error("the fault is not in a notice");
  }
  await userEvent.click(within(notice).getByRole("button", { name: "Read again" }));
  await vi.waitFor(() => expect(jobsFaultStore.get()).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(names()).toEqual(["Backscatter HH"]);
});

test("the command Read again of the header reads the jobs from the server", async () => {
  await show([RUNNING]);
  server.jobs = [RUNNING, WAITING];
  await userEvent.click(screen.getByRole("button", { name: "Read again" }));
  await vi.waitFor(() => expect(names()).toEqual(["Coherence HH", "Backscatter HH"]));
});

test("a job is cancelled with the keyboard alone", async () => {
  await show([RUNNING]);
  commandsOf("Backscatter HH, 21 Oct 2026").getByRole("button", { name: "Cancel" }).focus();
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(jobsStore.get()).toEqual([]));
});

const LABORATORY_NAME = { id: LABORATORY.id, name: LABORATORY.name };
const stateLine = (title: string) =>
  screen.getByText(title, { selector: ".item-title" }).closest("li")?.querySelector(".item-line")?.textContent;

test("a job says on which server it runs once the visitor has an own server", () => {
  expect(serverWords(RUNNING, [])).toBeNull();
  expect(serverWords(RUNNING, SERVERS.servers)).toBe("On the project server");
  expect(serverWords({ ...RUNNING, server: OFFICE_NAME }, SERVERS.servers)).toBe("On Office computer");
  expect(serverWords({ ...RUNNING, server: OFFICE_NAME }, [])).toBe("On Office computer");
});

test("the list shows the server of each job beside its state", async () => {
  serversStore.set(SERVERS);
  await show([{ ...RUNNING, server: OFFICE_NAME }, FINISHED]);
  expect(stateLine("Backscatter HH, 21 Oct 2026")).toBe("Running, 40 % after 1 min 5 s · On Office computer");
  expect(stateLine("Soil moisture, 2 Nov 2026")).toBe("Finished · On the project server");
});

test("a visitor without an own server reads no server in the list", async () => {
  await show([RUNNING]);
  expect(stateLine("Backscatter HH, 21 Oct 2026")).toBe("Running, 40 % after 1 min 5 s");
});

test("a job whose server disconnects while it runs says that its state is the last one reported", async () => {
  const away =
    'The server "Laboratory server" is not connected, so this is the last state that it reported. The state follows when the server connects again.';
  const running = { ...RUNNING, server: LABORATORY_NAME };
  expect(awayWords(running, SERVERS.servers)).toBe(away);
  expect(awayWords({ ...FINISHED, server: LABORATORY_NAME }, SERVERS.servers)).toBeNull();
  expect(awayWords({ ...RUNNING, server: OFFICE_NAME }, SERVERS.servers)).toBeNull();
  expect(awayWords(RUNNING, SERVERS.servers)).toBeNull();
  expect(awayWords(running, [])).toBeNull();
  serversStore.set({ ...SERVERS, servers: [OFFICE, { ...LABORATORY, connected: true }] });
  await show([running]);
  expect(screen.queryByText(away)).toBeNull();
  act(() => serversStore.set(SERVERS));
  expect(screen.getByText(away)).toBeDefined();
  expect(stateLine("Backscatter HH, 21 Oct 2026")).toBe("Running, 40 % after 1 min 5 s · On Laboratory server");
});

test("a job is run again on the server on which it ran", async () => {
  serversStore.set(SERVERS);
  server.servers = SERVERS;
  await show([
    { ...FAILED, server: OFFICE_NAME },
    { ...FAILED, jobID: "site", title: "Coherence HH, 9 and 21 Oct 2026" },
  ]);
  await userEvent.click(commandsOf("Azimuth offset, 9 and 21 Oct 2026").getByRole("button", { name: "Run again" }));
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  await userEvent.click(commandsOf("Coherence HH, 9 and 21 Oct 2026").getByRole("button", { name: "Run again" }));
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(2));
  expect(server.sent("POST").map(({ address }) => address)).toEqual([
    `/api/processes/get-layer/execution?server=${OFFICE.id}`,
    "/api/processes/get-layer/execution?server=project",
  ]);
});

test("a visitor without an own server runs a job again without naming a server", async () => {
  await show([FAILED]);
  await userEvent.click(commandsOf("Azimuth offset, 9 and 21 Oct 2026").getByRole("button", { name: "Run again" }));
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]?.address).toBe("/api/processes/get-layer/execution");
});

test("a new run that the server refuses for the servers of its input layers is reported in its words", async () => {
  const sentence = "The input layers are kept on different servers. A tool takes the input layers of one server.";
  server.refuse("POST", "/api/processes", 422, sentence);
  await show([{ ...FAILED, processID: "backscatter-change", inputs: { inputs: ["a", "b"], title: "Change" } }]);
  await userEvent.click(commandsOf("Azimuth offset, 9 and 21 Oct 2026").getByRole("button", { name: "Run again" }));
  await vi.waitFor(() => expect(messages()).toEqual([["error", sentence]]));
});

test("the details of a job name its server", () => {
  const rows = (groups: ReturnType<typeof jobGroups>) =>
    groups.flatMap(({ title, rows: part }) =>
      part.map(({ name, value }) => `${title ?? ""} / ${name}: ${typeof value === "string" ? value : ""}`),
    );
  expect(rows(jobGroups(RUNNING))).toContain("Job / Server: Project server");
  expect(rows(jobGroups({ ...RUNNING, server: OFFICE_NAME }))).toContain("Job / Server: Office computer");
});
