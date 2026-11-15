import { vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import type { ServerName, Servers } from "../shared/servers";
import type { Job } from "./jobs";
import type { SeriesItem } from "./series";

/** A job as the server describes it, for the tests. */
export function job(change: Partial<Job> = {}): Job {
  return {
    processID: "get-layer",
    type: "process",
    jobID: "0123456789abcdef0123456789abcdef",
    title: "Backscatter HH, 21 Oct 2026",
    status: "running",
    message: "NASA Harmony is preparing the layer.",
    created: "2026-11-14T16:20:00Z",
    started: "2026-11-14T16:20:05Z",
    updated: "2026-11-14T16:21:10Z",
    progress: 40,
    inputs: {
      product: "GCOV",
      granule: "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001",
      layer: "HHHH",
      area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
    },
    ...change,
  };
}

/** A layer description as the server sends it, for the tests. */
export function layer(change: Partial<LayerDescription> = {}): LayerDescription {
  return {
    id: "fedcba9876543210fedcba9876543210",
    title: "Backscatter HH, 21 Oct 2026",
    kind: "layer",
    url: "/files/fedcba9876543210fedcba9876543210/backscatter-hh.tif",
    quantity: "Radar backscatter gamma nought, HH, linear power",
    unit: "1",
    range: [0.01, 0.6],
    colours: "grey",
    dates: ["2026-10-21"],
    inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: "/files/fedcba9876543210fedcba9876543210/backscatter-hh.json",
    ...change,
  };
}

/** One request that the stand-in received. */
export interface Received {
  method: string;
  address: string;
  content: unknown;
}

/** What the stand-in answers: a status code, the content and the headers. */
export interface Reply {
  status: number;
  content?: unknown;
  headers?: Record<string, string>;
}

/** An entry of the list of layers, as the server sends it. */
export interface SentLayer {
  layer: LayerDescription;
  size?: number;
  created?: string;
  server?: ServerName | null;
}

/**
 * A stand-in for the web service, which answers the requests about jobs, layers and series from lists that a test fills
 * and changes. It takes the place of `fetch`.
 */
export class StandIn {
  /** The jobs of the session, the newest first. */
  jobs: Job[] = [];
  /** The layers of the session, the newest first. */
  layers: SentLayer[] = [];
  /** The series of the session, the newest first. */
  series: SeriesItem[] = [];
  /** The largest number of jobs in one page of the list, or null for one page. */
  page: number | null = null;
  /** The description of the process `get-layer`, or null when the server offers none. */
  process: unknown = null;
  /** The files that the web server holds, by their address. */
  files: Record<string, unknown> = {};
  /** The own servers of the visitor, or null for a visitor who is not signed in to Earthdata. */
  servers: Servers | null = null;
  /** The answer of the server about its version, its resources and its limits, or null when it gives none. */
  limits: unknown = null;
  /** The requests received, in their order. */
  readonly received: Received[] = [];

  private readonly refusals: { method: string; start: string; reply: Reply; skip: number }[] = [];
  private started = 0;

  /**
   * Answer the requests of one kind with a refusal, after the first `skip` of them were answered as usual. A
   * refusal without a sentence has a content that is no object.
   */
  refuse(method: string, start: string, status: number, detail: string | null, skip = 0): void {
    this.refusals.push({ method, start, reply: { status, content: detail === null ? "error" : { detail } }, skip });
  }

  /** Stop refusing. */
  accept(): void {
    this.refusals.length = 0;
  }

  /** The requests of one method whose address starts with the given text. */
  sent(method: string, start = ""): Received[] {
    return this.received.filter((request) => request.method === method && request.address.startsWith(start));
  }

  /** Change a job in place, as the work of the server does. */
  change(id: string, change: Partial<Job>): void {
    this.jobs = this.jobs.map((listed) => (listed.jobID === id ? { ...listed, ...change } : listed));
  }

  readonly fetch = vi.fn<typeof fetch>((input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const content: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    this.received.push({ method, address, content });
    const { status, content: sent, headers } = this.reply(method, address, content);
    return Promise.resolve(new Response(sent === undefined ? null : JSON.stringify(sent), { status, headers }));
  });

  private reply(method: string, address: string, content: unknown): Reply {
    const refusal = this.refusals.find((listed) => listed.method === method && address.startsWith(listed.start));
    if (refusal) {
      if (refusal.skip === 0) {
        return refusal.reply;
      }
      refusal.skip -= 1;
    }
    const [path = "", query = ""] = address.split("?");
    const name = path.split("/").at(-1) ?? "";
    if (method === "GET" && path === "/api/jobs") {
      const offset = Number(new URLSearchParams(query).get("offset") ?? "0");
      const limit = this.page ?? this.jobs.length;
      const links =
        offset + limit < this.jobs.length
          ? [{ href: `/api/jobs?limit=${String(limit)}&offset=${String(offset + limit)}`, rel: "next" }]
          : [];
      return { status: 200, content: { jobs: this.jobs.slice(offset, offset + limit), links } };
    }
    if (method === "POST" && /^\/api\/processes\/[^/]+\/execution$/.test(path)) {
      this.started += 1;
      const inputs = (content as { inputs: Record<string, unknown> }).inputs;
      // A job that names an own server of the visitor runs there. Every other job runs on the project server.
      const chosen = new URLSearchParams(query).get("server");
      const server = this.servers?.servers.find((listed) => listed.id === chosen);
      const created = job({
        jobID: `job-${String(this.started)}`,
        processID: path.split("/").at(-2) ?? "",
        title: `Job ${String(this.started)}`,
        status: "accepted",
        message: "The job waits for its turn.",
        started: undefined,
        progress: 0,
        inputs,
        server: server ? { id: server.id, name: server.name } : null,
      });
      this.jobs = [created, ...this.jobs];
      return { status: 201, content: created, headers: { Location: `/api/jobs/${created.jobID}` } };
    }
    if (method === "GET" && path === "/api/processes/get-layer") {
      return this.process === null
        ? { status: 404, content: { detail: "The server offers no process of this name." } }
        : { status: 200, content: this.process };
    }
    if (path.startsWith("/api/jobs/")) {
      const results = name === "results";
      const id = results ? (path.split("/").at(-2) ?? "") : name;
      const found = this.jobs.find((listed) => listed.jobID === id);
      if (!found) {
        return { status: 404, content: { detail: "Your session has no job of this name." } };
      }
      if (method === "DELETE") {
        this.jobs = this.jobs.filter((listed) => listed !== found);
        return { status: 200, content: { ...found, status: "dismissed", message: "The job was dismissed." } };
      }
      const made = this.layers.find((entry) => entry.layer.id === found.layer);
      const drawn = this.series.find((item) => item.series.id === found.series);
      if (results && drawn) {
        return { status: 200, content: drawn.series };
      }
      return results && made ? { status: 200, content: made.layer } : { status: 200, content: found };
    }
    if (method === "GET" && path === "/api/limits" && this.limits !== null) {
      return { status: 200, content: this.limits };
    }
    if (method === "GET" && path === "/api/servers") {
      return this.servers === null
        ? { status: 401, content: { detail: "Sign in to Earthdata to see your servers." } }
        : { status: 200, content: this.servers };
    }
    if (method === "GET" && path === "/api/layers") {
      return { status: 200, content: { layers: this.layers } };
    }
    if (path.startsWith("/api/layers/")) {
      const found = this.layers.find((entry) => entry.layer.id === name);
      if (!found) {
        return { status: 404, content: { detail: "Your session has no layer of this name." } };
      }
      if (method === "DELETE") {
        this.layers = this.layers.filter((entry) => entry !== found);
        this.jobs = this.jobs.filter((listed) => listed.layer !== name);
        return { status: 204 };
      }
      const renamed = { ...found, layer: { ...found.layer, title: (content as { title: string }).title } };
      this.layers = this.layers.map((entry) => (entry === found ? renamed : entry));
      return { status: 200, content: renamed };
    }
    if (method === "GET" && path === "/api/series") {
      return { status: 200, content: { series: this.series } };
    }
    if (path.startsWith("/api/series/")) {
      const found = this.series.find((item) => item.series.id === name);
      if (!found) {
        return { status: 404, content: { detail: "Your session has no series of this name." } };
      }
      if (method === "DELETE") {
        this.series = this.series.filter((item) => item !== found);
        this.jobs = this.jobs.filter((listed) => listed.series !== name);
        return { status: 204 };
      }
      const renamed = { ...found, series: { ...found.series, title: (content as { title: string }).title } };
      this.series = this.series.map((item) => (item === found ? renamed : item));
      return { status: 200, content: renamed };
    }
    if (method === "GET" && path in this.files) {
      return { status: 200, content: this.files[path] };
    }
    return { status: 404, content: { detail: "Not found." } };
  }
}

/** Put a stand-in for the web service in the place of `fetch`, and return it. */
export function standIn(): StandIn {
  const server = new StandIn();
  vi.stubGlobal("fetch", server.fetch);
  return server;
}

/** Tell the page that it is shown or hidden, as the browser does when the visitor changes the tab. */
export function showPage(shown: boolean): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (shown ? "visible" : "hidden") });
  document.dispatchEvent(new Event("visibilitychange"));
}
