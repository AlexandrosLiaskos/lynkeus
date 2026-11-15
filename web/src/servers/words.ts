import { formatMoment } from "../data/jobs";
import { amount, countWords, memoryWords, sizeWords } from "../header/notice/numbers";
import type { PropertyGroup } from "../shared/properties/PropertyList";
import { MOST_RUNNING_JOBS, type Server, type ServerLimits, type ServerState } from "../shared/servers";

/** What the interface writes about an own server, in the words and the units that a person reads. */

/** The number of bytes of one gigabyte. The limits of a server are typed in gigabytes of 1000 megabytes. */
export const GIGABYTE = 1e9;

/** Write a time given in seconds since 1 January 1970 (UTC) in the form "15 Nov 2026, 09:40:12 UTC". */
export function momentWords(seconds: number): string {
  return formatMoment(new Date(seconds * 1000).toISOString());
}

/**
 * State whether a server is connected and since when it is not. A server that is not connected sent its last
 * message at the time named; a server that was paired and has not sent a message yet has no such time.
 */
export function connectionWords(server: Server): string {
  if (server.connected) {
    return "Connected";
  }
  return server.state === null && server.seen <= server.paired
    ? "Not connected yet"
    : `Not connected since ${momentWords(server.seen)}`;
}

/** State how many servers of a list are connected, and how many one Earthdata account may connect. */
export function serversSentence(servers: readonly Server[], limit: number): string {
  const connected = servers.filter((server) => server.connected).length;
  const count =
    servers.length === 1
      ? connected === 1
        ? "Your server is connected."
        : "Your server is not connected."
      : `${String(connected)} of your ${String(servers.length)} servers are connected.`;
  return `${count} One Earthdata account connects at most ${amount(limit, "server", "servers")}.`;
}

/**
 * Return what is wrong with the storage of a server, in one sentence, or null. The layers of a server may use
 * the space that its limit allows, and no more than the disk has free.
 */
export function storageProblem(name: string, state: ServerState | null): string | null {
  if (state === null) {
    return null;
  }
  if (state.disk_used >= state.limits.storage) {
    return `The layers of the server "${name}" use ${sizeWords(state.disk_used)}, and its limit allows ${sizeWords(state.limits.storage)}. Remove layers of that server or raise its limit before a job that makes a layer is started there.`;
  }
  if (state.disk_free === 0) {
    return `The disk of the server "${name}" has no free space. Free space on that computer before a job that makes a layer is started there.`;
  }
  return null;
}

/**
 * Return what a server reports about itself as names and values in groups: the computer, its jobs, its disk
 * and its connection. A server that has not reported yet shows its connection alone.
 */
export function serverGroups(server: Server): PropertyGroup[] {
  const { state } = server;
  const connection: PropertyGroup = {
    title: "Connection",
    rows: [
      { name: "Connected to your account", value: momentWords(server.paired) },
      ...(server.state === null && server.seen <= server.paired
        ? []
        : [{ name: "Last message", value: momentWords(server.seen) }]),
      { name: "Identifier", value: server.id, copy: true },
    ],
  };
  if (state === null) {
    return [connection];
  }
  const { limits } = state;
  return [
    {
      title: "Computer",
      rows: [
        { name: "System", value: state.system },
        { name: "Lynkeus Server", value: `Version ${state.version}` },
        { name: "Processors", value: countWords(state.processors) },
        { name: "Memory", value: state.memory === null ? "Not known" : memoryWords(state.memory) },
      ],
    },
    {
      title: "Jobs",
      rows: [
        { name: "Running", value: `${countWords(state.running)} of at most ${countWords(limits.running_jobs)}` },
        { name: "Waiting", value: countWords(state.waiting) },
      ],
    },
    {
      title: "Layers and disk",
      rows: [
        { name: "Layers kept", value: countWords(state.layers) },
        {
          name: "Space used by layers",
          value: `${sizeWords(state.disk_used)} of at most ${sizeWords(limits.storage)}`,
        },
        { name: "Largest layer allowed", value: sizeWords(limits.layer_size) },
        { name: "Free disk space", value: sizeWords(state.disk_free) },
      ],
    },
    connection,
  ];
}

/** Return the limits that a form shows for a server, as names and values. */
export function limitRows(state: ServerState): { name: string; value: string }[] {
  const { limits } = state;
  return [
    {
      name: "Jobs at the same time",
      value: `${countWords(limits.running_jobs)} (${countWords(state.running)} running, ${countWords(state.waiting)} waiting)`,
    },
    { name: "Largest layer", value: sizeWords(limits.layer_size) },
    { name: "Space for layers", value: `${sizeWords(state.disk_used)} of ${sizeWords(limits.storage)} used` },
    { name: "Free disk space", value: sizeWords(state.disk_free) },
  ];
}

/** The limits of a server as the fields of the form hold them: the sizes in gigabytes. */
export interface LimitsDraft {
  jobs: string;
  storage: string;
  layer: string;
}

/** Return the limits of a server as texts for the fields of the form, with the sizes in gigabytes. */
export function draftOf(limits: ServerLimits): LimitsDraft {
  return {
    jobs: String(limits.running_jobs),
    storage: String(limits.storage / GIGABYTE),
    layer: String(limits.layer_size / GIGABYTE),
  };
}

/** What is wrong with each field of the form of the limits, in one sentence, or null for a field that is sound. */
export interface LimitsFaults {
  jobs: string | null;
  storage: string | null;
  layer: string | null;
}

function sizeOf(text: string): number | null {
  const value = text.trim() === "" ? Number.NaN : Number(text);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * GIGABYTE) : null;
}

/** Return what is wrong with the fields of the form of the limits. */
export function limitsFaults(draft: LimitsDraft): LimitsFaults {
  const jobs = draft.jobs.trim() === "" ? Number.NaN : Number(draft.jobs);
  return {
    jobs:
      Number.isInteger(jobs) && jobs >= 1 && jobs <= MOST_RUNNING_JOBS
        ? null
        : `Enter a whole number of jobs from 1 to ${String(MOST_RUNNING_JOBS)}.`,
    storage: sizeOf(draft.storage) === null ? "Enter the space in gigabytes, as a number of zero or more." : null,
    layer: sizeOf(draft.layer) === null ? "Enter the size in gigabytes, as a number of zero or more." : null,
  };
}

/** Return the limits that the fields of the form hold, in bytes, or null when a field is not sound. */
export function limitsOf(draft: LimitsDraft): ServerLimits | null {
  const faults = limitsFaults(draft);
  const storage = sizeOf(draft.storage);
  const layer = sizeOf(draft.layer);
  if (faults.jobs !== null || storage === null || layer === null) {
    return null;
  }
  return { running_jobs: Number(draft.jobs), storage, layer_size: layer };
}
