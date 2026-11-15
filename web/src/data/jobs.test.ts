import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  dismissJob,
  filterJobs,
  formatMoment,
  formatRunTime,
  isJob,
  isMoment,
  isUnfinished,
  jobResult,
  jobsFaultStore,
  jobsStore,
  loadJobs,
  LONGEST_PAUSE,
  nextPage,
  onJobFinished,
  POLL_TIME,
  removeFinishedJobs,
  resetJobs,
  runTime,
  sortJobs,
  startJob,
  watchJobs,
} from "./jobs";
import { OFFICE, OFFICE_NAME, SERVERS } from "../servers/testServers";
import { Refusal } from "./service";
import { job, layer, showPage, standIn } from "./testSession";

beforeEach(() => {
  resetJobs();
  showPage(true);
});

afterEach(() => {
  resetJobs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ids = () => jobsStore.get().map(({ jobID }) => jobID);

test("the state of a job that the server sends is accepted", () => {
  expect(isJob(job())).toBe(true);
  expect(isJob({ ...job(), links: [{ href: "/api/jobs/a", rel: "self" }] })).toBe(true);
  expect(isJob(job({ status: "accepted", started: undefined, inputs: undefined }))).toBe(true);
  expect(isJob(job({ status: "successful", finished: "2026-11-14T16:25:00Z", progress: 100, layer: "abc" }))).toBe(
    true,
  );
  expect(isJob(job({ started: null, finished: null, inputs: null, layer: null }))).toBe(true);
});

test.each([
  ["the name of the job is empty", { jobID: "" }],
  ["the process is not named", { processID: undefined }],
  ["the title is missing", { title: undefined }],
  ["the type is not a process", { type: "workflow" }],
  ["the status is unknown", { status: "queued" }],
  ["the message is not a text", { message: null }],
  ["the time of creation is not a date-time", { created: "14 Nov 2026" }],
  ["the time of the start is not a date-time", { started: "16:20" }],
  ["the progress is above 100", { progress: 120 }],
  ["the progress is not a whole number", { progress: 12.5 }],
  ["the inputs are a list", { inputs: ["HHHH"] }],
  ["the layer is not a text", { layer: 7 }],
])("the state of a job is rejected when %s", (_reason, change) => {
  expect(isJob({ ...job(), ...change })).toBe(false);
});

test("a date-time of RFC 3339 is recognised", () => {
  expect(isMoment("2026-11-14T16:20:00Z")).toBe(true);
  expect(isMoment("2026-11-14T18:20:00.5+02:00")).toBe(true);
  expect(isMoment("2026-11-14")).toBe(false);
  expect(isMoment("2026-13-45T16:20:00Z")).toBe(false);
});

test("the next page of the list is followed only on the address of the jobs", () => {
  expect(nextPage([{ href: "/api/jobs?limit=2&offset=2", rel: "next" }])).toBe("/api/jobs?limit=2&offset=2");
  expect(nextPage([{ href: "/api/jobs?limit=2&offset=0", rel: "self" }])).toBeNull();
  expect(nextPage([{ href: "https://example.org/api/jobs?offset=2", rel: "next" }])).toBeNull();
  expect(nextPage(undefined)).toBeNull();
});

test("the jobs of the server are kept in the order of the server", async () => {
  const server = standIn();
  server.jobs = [job({ jobID: "b" }), job({ jobID: "a", status: "successful" })];
  await loadJobs();
  expect(ids()).toEqual(["b", "a"]);
  expect(jobsFaultStore.get()).toBeNull();
});

test("every page of a long list is read", async () => {
  const server = standIn();
  server.jobs = ["e", "d", "c", "b", "a"].map((jobID) => job({ jobID, status: "failed" }));
  server.page = 2;
  await loadJobs();
  expect(ids()).toEqual(["e", "d", "c", "b", "a"]);
  expect(server.sent("GET", "/api/jobs").map(({ address }) => address)).toEqual([
    "/api/jobs",
    "/api/jobs?limit=2&offset=2",
    "/api/jobs?limit=2&offset=4",
  ]);
});

test("a call during a reading joins that reading", async () => {
  const server = standIn();
  await Promise.all([loadJobs(), loadJobs()]);
  expect(server.sent("GET", "/api/jobs")).toHaveLength(1);
});

test("a reading that fails states the sentence of the server and keeps the list", async () => {
  const server = standIn();
  server.jobs = [job()];
  await loadJobs();
  server.refuse(
    "GET",
    "/api/jobs",
    503,
    "The web service of Lynkeus does not answer at present. Try again in a minute.",
  );
  await loadJobs();
  expect(jobsFaultStore.get()).toBe("The web service of Lynkeus does not answer at present. Try again in a minute.");
  expect(ids()).toEqual([job().jobID]);
  server.accept();
  await loadJobs();
  expect(jobsFaultStore.get()).toBeNull();
});

test("an answer that is not a list of jobs is refused", async () => {
  const server = standIn();
  server.jobs = [{ ...job(), status: "queued" } as never];
  await loadJobs();
  expect(jobsFaultStore.get()).toBe("The answer of the server could not be read.");
  expect(jobsStore.get()).toEqual([]);
});

test("a list that has not changed keeps its place in the store", async () => {
  const server = standIn();
  server.jobs = [job()];
  await loadJobs();
  const first = jobsStore.get();
  await loadJobs();
  expect(jobsStore.get()).toBe(first);
});

test("a job is started with its inputs and stands first in the list", async () => {
  const server = standIn();
  server.jobs = [job({ jobID: "old", status: "successful" })];
  await loadJobs();
  const inputs = { product: "GCOV", granule: "NISAR_A", layer: "HHHH", area: { west: 1, south: 2, east: 3, north: 4 } };
  const started = await startJob("get-layer", inputs);
  expect(server.sent("POST")).toEqual([
    { method: "POST", address: "/api/processes/get-layer/execution", content: { inputs } },
  ]);
  expect(started.status).toBe("accepted");
  expect(started.inputs).toEqual(inputs);
  expect(ids()).toEqual(["job-1", "old"]);
});

test("a limit of the server is reported in its words, with the time to wait", async () => {
  const server = standIn();
  server.refuse(
    "POST",
    "/api/processes",
    429,
    "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish.",
  );
  const refusal = await startJob("get-layer", {}).catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).toMatchObject({
    status: 429,
    message: "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish.",
  });
  expect(jobsStore.get()).toEqual([]);
});

test("a dismissed job leaves the list", async () => {
  const server = standIn();
  server.jobs = [job({ jobID: "b" }), job({ jobID: "a" })];
  await loadJobs();
  await dismissJob("b");
  expect(server.sent("DELETE")).toEqual([{ method: "DELETE", address: "/api/jobs/b", content: undefined }]);
  expect(ids()).toEqual(["a"]);
});

test("a job that the server no longer holds leaves the list as well", async () => {
  const server = standIn();
  server.jobs = [job({ jobID: "a" })];
  await loadJobs();
  server.jobs = [];
  await dismissJob("a");
  expect(ids()).toEqual([]);
  jobsStore.set([job({ jobID: "c" })]);
  server.refuse("DELETE", "/api/jobs/c", 410, "The job was dismissed.");
  await dismissJob("c");
  expect(ids()).toEqual([]);
});

test("a job that the server refuses to dismiss stays in the list", async () => {
  const server = standIn();
  server.jobs = [job({ jobID: "a" })];
  await loadJobs();
  server.refuse("DELETE", "/api/jobs", 500, null);
  await expect(dismissJob("a")).rejects.toThrow("The job could not be removed (the server answered 500).");
  expect(ids()).toEqual(["a"]);
});

test("the answer to a reading that started before a removal does not bring the job back", async () => {
  const server = standIn();
  server.jobs = [job({ jobID: "a", status: "failed" })];
  await loadJobs();
  const slow = loadJobs();
  await dismissJob("a");
  await slow;
  expect(ids()).toEqual([]);
});

test("the records of all finished jobs are removed, and the others stay", async () => {
  const server = standIn();
  server.jobs = [
    job({ jobID: "d", status: "running" }),
    job({ jobID: "c", status: "failed" }),
    job({ jobID: "b", status: "accepted" }),
    job({ jobID: "a", status: "successful" }),
  ];
  await loadJobs();
  await expect(removeFinishedJobs()).resolves.toBe(2);
  expect(ids()).toEqual(["d", "b"]);
  expect(server.jobs.map(({ jobID }) => jobID)).toEqual(["d", "b"]);
});

test("the result of a successful job is the description of its layer", async () => {
  const server = standIn();
  server.layers = [{ layer: layer() }];
  server.jobs = [job({ jobID: "a", status: "successful", layer: layer().id })];
  await expect(jobResult("a")).resolves.toEqual(layer());
  expect(server.sent("GET").map(({ address }) => address)).toEqual(["/api/jobs/a/results"]);
  server.jobs = [job({ jobID: "b" })];
  await expect(jobResult("b")).rejects.toThrow("The answer of the server could not be read.");
});

test("the jobs are read again every three seconds while one waits or runs, and no longer", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.jobs = [job({ jobID: "a", status: "accepted" })];
  const stop = watchJobs();
  await vi.advanceTimersByTimeAsync(0);
  expect(server.sent("GET")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(POLL_TIME - 1);
  expect(server.sent("GET")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(server.sent("GET")).toHaveLength(2);
  server.change("a", { status: "successful", progress: 100 });
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  expect(server.sent("GET")).toHaveLength(3);
  expect(jobsStore.get()[0]?.status).toBe("successful");
  await vi.advanceTimersByTimeAsync(10 * POLL_TIME);
  expect(server.sent("GET")).toHaveLength(3);
  stop();
});

test("a session without a waiting or running job is read once", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.jobs = [job({ status: "failed" })];
  const stop = watchJobs();
  await vi.advanceTimersByTimeAsync(10 * POLL_TIME);
  expect(server.sent("GET")).toHaveLength(1);
  stop();
});

test("a job that is started is followed", async () => {
  vi.useFakeTimers();
  const server = standIn();
  const stop = watchJobs();
  await vi.advanceTimersByTimeAsync(0);
  await startJob("get-layer", {});
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  expect(server.sent("GET")).toHaveLength(2);
  stop();
});

test("a hidden page reads nothing, and a page that is shown again reads at once", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.jobs = [job()];
  const stop = watchJobs();
  await vi.advanceTimersByTimeAsync(0);
  showPage(false);
  await vi.advanceTimersByTimeAsync(10 * POLL_TIME);
  expect(server.sent("GET")).toHaveLength(1);
  showPage(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(server.sent("GET")).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  expect(server.sent("GET")).toHaveLength(3);
  stop();
});

test("the pause doubles while the server does not answer, up to the longest pause", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.jobs = [job()];
  const stop = watchJobs();
  await vi.advanceTimersByTimeAsync(0);
  server.refuse("GET", "/api/jobs", 503, "The web service of Lynkeus does not answer at present.");
  const readings = () => server.sent("GET").length;
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  expect(readings()).toBe(2);
  await vi.advanceTimersByTimeAsync(2 * POLL_TIME - 1);
  expect(readings()).toBe(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(readings()).toBe(3);
  await vi.advanceTimersByTimeAsync(4 * POLL_TIME + 8 * POLL_TIME);
  expect(readings()).toBe(5);
  await vi.advanceTimersByTimeAsync(LONGEST_PAUSE - 1);
  expect(readings()).toBe(5);
  await vi.advanceTimersByTimeAsync(1);
  expect(readings()).toBe(6);
  server.accept();
  await vi.advanceTimersByTimeAsync(LONGEST_PAUSE);
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  expect(readings()).toBe(8);
  stop();
});

test("the readings end when the page stops watching", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.jobs = [job()];
  const stop = watchJobs();
  await vi.advanceTimersByTimeAsync(0);
  stop();
  await vi.advanceTimersByTimeAsync(10 * POLL_TIME);
  showPage(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(server.sent("GET")).toHaveLength(1);
});

test("a job that ends between two readings is reported once to the listeners", async () => {
  const server = standIn();
  const finished = vi.fn();
  const end = onJobFinished(finished);
  server.jobs = [job({ jobID: "b" }), job({ jobID: "a", status: "failed", message: "Old failure." })];
  await loadJobs();
  expect(finished).not.toHaveBeenCalled();
  server.change("b", { status: "failed", message: "NASA Harmony refused the request." });
  await loadJobs();
  await loadJobs();
  expect(finished).toHaveBeenCalledTimes(1);
  expect(finished).toHaveBeenCalledWith(expect.objectContaining({ jobID: "b", status: "failed" }));
  end();
  server.jobs = [job({ jobID: "c" }), ...server.jobs];
  await loadJobs();
  server.change("c", { status: "successful" });
  await loadJobs();
  expect(finished).toHaveBeenCalledTimes(1);
});

test("a job waits or runs until it has succeeded or failed", () => {
  expect(isUnfinished(job({ status: "accepted" }))).toBe(true);
  expect(isUnfinished(job({ status: "running" }))).toBe(true);
  expect(isUnfinished(job({ status: "successful" }))).toBe(false);
  expect(isUnfinished(job({ status: "failed" }))).toBe(false);
});

test("the time of the work runs from the start to the end, or to the last change of a running job", () => {
  expect(runTime(job({ status: "accepted", started: undefined }))).toBeNull();
  expect(runTime(job())).toBe(65);
  expect(runTime(job({ status: "successful", finished: "2026-11-14T16:32:10Z" }))).toBe(725);
});

test("a time and a moment are written for reading", () => {
  expect(formatRunTime(45)).toBe("45 s");
  expect(formatRunTime(125)).toBe("2 min 5 s");
  expect(formatRunTime(3780)).toBe("1 h 3 min");
  expect(formatMoment("2026-11-14T16:20:05Z")).toBe("14 Nov 2026, 16:20:05 UTC");
  expect(formatMoment("2026-11-14T18:20:05+02:00")).toBe("14 Nov 2026, 16:20:05 UTC");
  expect(formatMoment("2026-09-27T16:20:05Z")).toBe("27 Sep 2026, 16:20:05 UTC");
});

test("the jobs are sorted by start, status and name", () => {
  const jobs = [
    job({ jobID: "c", title: "Coherence", created: "2026-11-14T16:30:00Z", status: "successful" }),
    job({ jobID: "b", title: "Backscatter", created: "2026-11-14T16:20:00Z", status: "accepted" }),
    job({ jobID: "a", title: "Alpha", created: "2026-11-14T16:25:00Z", status: "running" }),
    job({ jobID: "d", title: "Delta", created: "2026-11-14T16:10:00Z", status: "failed" }),
  ];
  const order = (sorted: typeof jobs) => sorted.map(({ jobID }) => jobID).join("");
  expect(order(sortJobs(jobs, "newest"))).toBe("cabd");
  expect(order(sortJobs(jobs, "oldest"))).toBe("dbac");
  expect(order(sortJobs(jobs, "status"))).toBe("abdc");
  expect(order(sortJobs(jobs, "name"))).toBe("abcd");
  expect(order(jobs)).toBe("cbad");
});

test("a part of the list holds the jobs of its states", () => {
  const jobs = [
    job({ jobID: "a", status: "accepted" }),
    job({ jobID: "b", status: "running" }),
    job({ jobID: "c", status: "successful" }),
    job({ jobID: "d", status: "failed" }),
  ];
  const names = (part: typeof jobs) => part.map(({ jobID }) => jobID).join("");
  expect(names(filterJobs(jobs, "all"))).toBe("abcd");
  expect(names(filterJobs(jobs, "unfinished"))).toBe("ab");
  expect(names(filterJobs(jobs, "successful"))).toBe("c");
  expect(names(filterJobs(jobs, "failed"))).toBe("d");
});

test("a job is started on the server that is named, and without a name the address carries no parameter", async () => {
  const server = standIn();
  server.servers = SERVERS;
  await startJob("get-layer", {}, OFFICE.id);
  await startJob("get-layer", {}, "project");
  await startJob("get-layer", {});
  expect(server.sent("POST").map(({ address }) => address)).toEqual([
    `/api/processes/get-layer/execution?server=${OFFICE.id}`,
    "/api/processes/get-layer/execution?server=project",
    "/api/processes/get-layer/execution",
  ]);
  expect(jobsStore.get().map((started) => started.server)).toEqual([null, null, OFFICE_NAME]);
});

test("the state of a job names the own server on which the job runs, or none", () => {
  expect(isJob(job({ server: OFFICE_NAME }))).toBe(true);
  expect(isJob(job({ server: null }))).toBe(true);
  expect(isJob(job())).toBe(true);
  expect(isJob({ ...job(), server: { id: "office", name: "Office computer" } })).toBe(false);
  expect(isJob({ ...job(), server: "Office computer" })).toBe(false);
});

test("input layers that are kept on different servers are refused in the words of the server", async () => {
  const server = standIn();
  const sentence = "The input layers are kept on different servers. A tool takes the input layers of one server.";
  server.refuse("POST", "/api/processes", 422, sentence);
  const refusal = await startJob("backscatter-change", { inputs: ["a", "b"] }, OFFICE.id).catch(
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).toMatchObject({ status: 422, message: sentence });
  expect(jobsStore.get()).toEqual([]);
});
