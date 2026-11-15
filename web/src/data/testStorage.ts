// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { vi } from "vitest";
import type { SeriesItem } from "./series";
import { standIn, type Reply, type SentLayer, type StandIn } from "./testSession";

/** An entry of the list of layers with the moment until which the project server keeps it. */
export type KeptLayer = SentLayer & { kept_until?: string | null };

/** Return an entry of the list of layers that the project server keeps until a moment. */
export function keptLayer(entry: SentLayer, until: string | null): KeptLayer {
  return { ...entry, kept_until: until };
}

/** Return an entry of the list of series that the project server keeps until a moment. */
export function keptSeries(item: SeriesItem, until: string | null): SeriesItem {
  return { ...item, kept_until: until };
}

/**
 * A stand-in for the addresses of `docs/Storage.md` that keep longer and remove what an account has on the
 * project server. It stands in front of the stand-in of the web service, which answers every other request, and
 * it takes the place of `fetch`.
 */
export class Keeper {
  /** The stand-in of the web service, whose lists of jobs, layers and series this one changes. */
  readonly server: StandIn;
  /** The moment until which an extension keeps a layer or a series. */
  until = "2026-12-01T10:00:00Z";

  private readonly refusals: { method: string; start: string; reply: Reply }[] = [];

  constructor(server: StandIn) {
    this.server = server;
  }

  /** Answer the requests of one kind to the addresses of the storage with a refusal. */
  refuse(method: string, start: string, status: number, detail: string | null): void {
    this.refusals.push({ method, start, reply: { status, content: detail === null ? "error" : { detail } } });
  }

  /** Stop refusing. */
  accept(): void {
    this.refusals.length = 0;
  }

  readonly fetch = vi.fn<typeof fetch>((input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const reply = this.reply(method, address);
    if (reply === null) {
      return this.server.fetch(input, init);
    }
    this.server.received.push({ method, address, content: undefined });
    const { status, content } = reply;
    return Promise.resolve(new Response(content === undefined ? null : JSON.stringify(content), { status }));
  });

  private reply(method: string, address: string): Reply | null {
    const one = /^\/api\/(layers|series)\/([^/]+)\/extension$/.exec(address);
    const all = address === "/api/storage/extension" || address === "/api/storage";
    if (!one && !all) {
      return null;
    }
    const refusal = this.refusals.find((listed) => listed.method === method && address.startsWith(listed.start));
    if (refusal) {
      return refusal.reply;
    }
    const { server, until } = this;
    if (method === "POST" && one) {
      const [, list, name] = one;
      if (list === "layers") {
        const found = server.layers.find((entry) => entry.layer.id === name && !entry.server);
        if (!found) {
          return { status: 404, content: { detail: "Your account has no layer of this name on the project server." } };
        }
        const kept = keptLayer(found, until);
        server.layers = server.layers.map((entry) => (entry === found ? kept : entry));
        return { status: 200, content: kept };
      }
      const found = server.series.find((item) => item.series.id === name);
      if (!found) {
        return { status: 404, content: { detail: "Your account has no series of this name." } };
      }
      const kept = keptSeries(found, until);
      server.series = server.series.map((item) => (item === found ? kept : item));
      return { status: 200, content: kept };
    }
    if (method === "POST" && address === "/api/storage/extension") {
      server.layers = server.layers.map((entry) => (entry.server ? entry : keptLayer(entry, until)));
      server.series = server.series.map((item) => keptSeries(item, until));
      return { status: 204 };
    }
    if (method === "DELETE" && address === "/api/storage") {
      // The servers of the account and their layers and jobs are not touched.
      server.layers = server.layers.filter((entry) => entry.server);
      server.series = [];
      server.jobs = server.jobs.filter((job) => job.server);
      return { status: 204 };
    }
    return { status: 405, content: { detail: "Method not allowed." } };
  }
}

/** Put the two stand-ins in the place of `fetch`, and return the one of the storage. */
export function keeper(): Keeper {
  const stand = new Keeper(standIn());
  vi.stubGlobal("fetch", stand.fetch);
  return stand;
}
