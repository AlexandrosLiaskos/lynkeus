import { vi } from "vitest";
import confirmation from "../../../api/tests/data/servers/pairing-confirmation.json";
import view from "../../../api/tests/data/servers/pairing-view.json";
import changeLimits from "../../../api/tests/data/servers/server-change-limits.json";
import changeName from "../../../api/tests/data/servers/server-change-name.json";
import changed from "../../../api/tests/data/servers/server-changed.json";
import name from "../../../api/tests/data/servers/server-name.json";
import paired from "../../../api/tests/data/servers/server-paired.json";
import list from "../../../api/tests/data/servers/servers.json";
import type { Job } from "../data/jobs";
import type { SentLayer } from "../data/testSession";
import { SAMPLE } from "../header/notice/testLimits";
import {
  isPairingView,
  isServer,
  isServerName,
  isServers,
  type PairingView,
  type Server,
  type ServerLimits,
  type ServerName,
  type Servers,
} from "../shared/servers";
import { latestReleaseAddress, REPOSITORY } from "./downloads";

// The example messages of `api/tests/data/servers`, which a test of the server validates against the formats of
// `api/src/lynkeus/linking.py`. Each one is checked here with the check of the interface before a test uses it.
function example<Message>(value: unknown, isMessage: (value: unknown) => value is Message, file: string): Message {
  if (!isMessage(value)) {
    throw new Error(`The example ${file} does not have the form that the interface accepts.`);
  }
  return value;
}

/** The servers of a visitor: one that is connected, one that is not and is at its storage limit, and a new one. */
export const SERVERS: Servers = example(list, isServers, "servers.json");
const [first, second, third] = SERVERS.servers;
if (!first || !second || !third) {
  throw new Error("The example servers.json holds fewer than three servers.");
}
/** The server that is connected and reports its state. */
export const OFFICE: Server = first;
/** The server that is not connected, whose layers use the space that its limit allows. */
export const LABORATORY: Server = second;
/** The server that was paired a moment ago and has not reported yet. */
export const NEW: Server = third;
/** The answer to a confirmed pairing. */
export const PAIRED: Server = example(paired, isServer, "server-paired.json");
/** The answer to a change of the first server: its new name and its new limits. */
export const CHANGED: Server = example(changed, isServer, "server-changed.json");
/** What the site shows before a pairing is confirmed. */
export const VIEW: PairingView = example(view, isPairingView, "pairing-view.json");
/** The server that the state of a job and an entry of the list of layers name. */
export const OFFICE_NAME: ServerName = example(name, isServerName, "server-name.json");
/** What the interface sends to confirm a pairing, to rename a server and to set its limits. */
export const CONFIRMATION: { user_code: string } = confirmation;
export const CHANGE_NAME: { name: string } = changeName;
export const CHANGE_LIMITS: { limits: ServerLimits } = changeLimits;

/** One request that the stand-in received. */
export interface Received {
  method: string;
  address: string;
  content: unknown;
}

interface Reply {
  status: number;
  content?: unknown;
}

/** The answer of GitHub for a repository without a release, as it was received on 15 November 2026. */
export const NO_RELEASE = {
  message: "Not Found",
  documentation_url: "https://docs.github.com/rest/releases/releases#get-the-latest-release",
  status: "404",
};

const RELEASE_FILES: readonly (readonly [string, number])[] = [
  ["Lynkeus-Server-0.2.0-Linux.tar.gz", 81_200_000],
  ["Lynkeus-Server-0.2.0-Windows.exe", 76_500_000],
  ["Lynkeus-Server-0.2.0-macOS.dmg", 79_900_000],
  ["checksums.txt", 300],
];

/**
 * A release of Lynkeus in the form in which GitHub answers, for the tests: the three files of Lynkeus Server
 * under the names that `docs/Own_Servers.md` fixes, and a file that is none of them. No such release exists.
 */
export const RELEASE = {
  html_url: `https://github.com/${REPOSITORY}/releases/tag/v0.2.0`,
  tag_name: "v0.2.0",
  name: "Lynkeus 0.2.0",
  draft: false,
  prerelease: false,
  published_at: "2026-11-20T10:00:00Z",
  assets: RELEASE_FILES.map(([file, size]) => ({
    name: file,
    content_type: "application/octet-stream",
    state: "uploaded",
    size,
    browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v0.2.0/${file}`,
  })),
};

/**
 * A stand-in for the project server and for GitHub, which answers the requests about the session, the own
 * servers of the visitor, his jobs and his layers from what a test puts into it. It takes the place of `fetch`.
 */
export class Site {
  /** The Earthdata user who is signed in, or null. */
  user: string | null = "a_user";
  /** The own servers of the user. */
  servers: Server[] = [];
  /** The most servers of one user. */
  limit = SERVERS.limit;
  /** The pairings that wait for a confirmation, by their code. */
  pairings: Record<string, PairingView> = {};
  /** The jobs and the layers that the lists of the session hold. */
  jobs: Job[] = [];
  layers: SentLayer[] = [];
  /** The limits that the owner set and that a server has not applied yet, by the name of the server. */
  wanted: Record<string, ServerLimits> = {};
  /** The answer of GitHub about the latest release, or null for no answer at all. */
  release: Reply | null = { status: 404, content: NO_RELEASE };
  /** The requests received, in their order. */
  readonly received: Received[] = [];

  private readonly refusals: { method: string; start: string; reply: Reply }[] = [];

  /** Answer the requests of one kind with a refusal. A refusal without a sentence has a content that is no object. */
  refuse(method: string, start: string, status: number, detail: string | null): void {
    this.refusals.push({ method, start, reply: { status, content: detail === null ? "error" : { detail } } });
  }

  /** Stop refusing. */
  accept(): void {
    this.refusals.length = 0;
  }

  /** Let a server apply the limits that its owner set, and report them, as the program does. */
  apply(id: string): void {
    const limits = this.wanted[id];
    this.servers = this.servers.map((server) =>
      server.id === id && server.state && limits ? { ...server, state: { ...server.state, limits } } : server,
    );
  }

  /** The requests of one method whose address starts with the given text. */
  sent(method: string, start = ""): Received[] {
    return this.received.filter((request) => request.method === method && request.address.startsWith(start));
  }

  readonly fetch = vi.fn<typeof fetch>((input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const content: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    this.received.push({ method, address, content });
    if (address === latestReleaseAddress(REPOSITORY) && this.release === null) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    const { status, content: sent } = this.reply(method, address, content);
    return Promise.resolve(new Response(sent === undefined ? null : JSON.stringify(sent), { status }));
  });

  private reply(method: string, address: string, content: unknown): Reply {
    const refusal = this.refusals.find((listed) => listed.method === method && address.startsWith(listed.start));
    if (refusal) {
      return refusal.reply;
    }
    if (address === latestReleaseAddress(REPOSITORY)) {
      return this.release ?? { status: 404 };
    }
    const session = { earthdata: this.user === null ? null : { user: this.user } };
    if (address === "/api/session") {
      return { status: 200, content: session };
    }
    if (address === "/api/session/earthdata") {
      this.user = method === "POST" ? "a_user" : null;
      return method === "POST" ? { status: 200, content: { earthdata: { user: this.user } } } : { status: 204 };
    }
    if (address === "/api/limits") {
      return { status: 200, content: SAMPLE };
    }
    if (address === "/api/jobs") {
      return { status: 200, content: { jobs: this.jobs, links: [] } };
    }
    if (address === "/api/layers") {
      return { status: 200, content: { layers: this.layers } };
    }
    if (!address.startsWith("/api/servers")) {
      return { status: 404, content: { detail: "Not found." } };
    }
    if (this.user === null) {
      return { status: 401, content: { detail: "Sign in to Earthdata to use your own servers." } };
    }
    const id = address.split("/").at(-1) ?? "";
    if (address === "/api/servers") {
      if (method === "GET") {
        return { status: 200, content: { servers: this.servers, limit: this.limit } };
      }
      const code = (content as { user_code: string }).user_code;
      const pairing = this.pairings[code];
      if (!pairing) {
        return { status: 404, content: { detail: "The code is unknown or no longer valid." } };
      }
      if (this.servers.length >= this.limit) {
        return { status: 409, content: { detail: "Your account has the most servers that it may connect." } };
      }
      this.pairings = Object.fromEntries(Object.entries(this.pairings).filter(([key]) => key !== code));
      const server = { ...PAIRED, name: pairing.machine.name };
      this.servers = [...this.servers, server];
      return { status: 201, content: server };
    }
    if (address.startsWith("/api/servers/pairings/")) {
      const pairing = this.pairings[id];
      return pairing
        ? { status: 200, content: pairing }
        : { status: 404, content: { detail: "The code is unknown or no longer valid." } };
    }
    const found = this.servers.find((server) => server.id === id);
    if (!found) {
      return { status: 404, content: { detail: "You have no server of this name." } };
    }
    if (method === "DELETE") {
      this.servers = this.servers.filter((server) => server !== found);
      this.layers = this.layers.filter((entry) => entry.server?.id !== id);
      return { status: 204 };
    }
    // The project server keeps new limits and passes them on. The state shows them once the server reports them.
    const change = content as { name?: string; limits?: ServerLimits };
    if (change.limits) {
      this.wanted = { ...this.wanted, [id]: change.limits };
    }
    const next: Server = { ...found, name: change.name ?? found.name };
    this.servers = this.servers.map((server) => (server === found ? next : server));
    return { status: 200, content: next };
  }
}

/** Put a stand-in for the project server and for GitHub in the place of `fetch`, and return it. */
export function site(): Site {
  const server = new Site();
  vi.stubGlobal("fetch", server.fetch);
  return server;
}
