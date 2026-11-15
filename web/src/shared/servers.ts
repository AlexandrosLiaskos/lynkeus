import { createStore } from "./store";

/**
 * The messages with which the interface manages the own servers of a visitor. An own server is a computer of the
 * visitor that runs the program Lynkeus Server, so that his jobs run there and their layers are kept there. The
 * server of the site is the project server. The formats are those of `api/src/lynkeus/linking.py`, and
 * `docs/Own_Servers.md` gives the addresses that send and take them.
 */

/** What an own server states about itself when it asks for a pairing. */
export interface Machine {
  /** Name of the computer. */
  name: string;
  /** Operating system and its version, for example "Windows 11". */
  system: string;
  /** Version of Lynkeus Server. */
  version: string;
}

/** What the site shows before the visitor confirms a pairing: the code and the computer that asked for it. */
export interface PairingView {
  user_code: string;
  machine: Machine;
}

/** The confirmation of a pairing by the signed-in visitor. */
export interface PairingConfirmation {
  user_code: string;
}

/** The limits of an own server, which its owner sets. Sizes are in bytes. */
export interface ServerLimits {
  /** Most jobs that run at the same time. */
  running_jobs: number;
  /** Most space that the layers may use on the disk. */
  storage: number;
  /** Largest size of the files of one layer. */
  layer_size: number;
}

/** What an own server reports about itself. Sizes are in bytes. */
export interface ServerState {
  /** Processors that the program may use. */
  processors: number;
  /** Memory of the computer, or null when it cannot be read. */
  memory: number | null;
  /** Free space of the disk that holds the layers. */
  disk_free: number;
  /** Space that the layers use. */
  disk_used: number;
  /** Jobs that run. */
  running: number;
  /** Jobs that wait for their turn. */
  waiting: number;
  /** Layers that the server keeps. */
  layers: number;
  /** Limits in force. */
  limits: ServerLimits;
  /** Operating system. */
  system: string;
  /** Version of Lynkeus Server. */
  version: string;
}

/** An own server, as the interface receives it. */
export interface Server {
  /** Name of the server among the servers: 16 characters. */
  id: string;
  /** Name that the visitor gave it, at first the name of the computer. */
  name: string;
  /** Whether the server sent a message to the project server during the last 75 seconds. */
  connected: boolean;
  /** Time of the pairing, in seconds since 1 January 1970 (UTC). */
  paired: number;
  /** Time of the last message of the server, in seconds since 1 January 1970 (UTC). */
  seen: number;
  /** Last state that the server reported, or null before its first report. */
  state: ServerState | null;
}

/** The own servers of the signed-in visitor, and the most that one Earthdata user may connect. */
export interface Servers {
  servers: readonly Server[];
  limit: number;
}

/** A change that the owner makes to a server. A field that is absent stays as it is. */
export interface ServerChange {
  name?: string | null;
  limits?: ServerLimits | null;
}

/** The own server of a job or of a layer, in the answers about jobs and layers. */
export interface ServerName {
  id: string;
  name: string;
}

/** The form of a code of a pairing, for example WDJB-MJHT: two groups of four of the 20 letters without vowels. */
export const USER_CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

/** The time for which the code of a pairing is valid, in seconds (`PAIRING_TIME`). */
export const PAIRING_TIME = 900;

/** The longest name of a server, in characters. */
export const MOST_NAME = 80;

/** The most jobs that an own server may run at the same time, as its limit allows. */
export const MOST_RUNNING_JOBS = 64;

/** The value of the parameter `server` of an execution that names the project server. */
export const PROJECT_SERVER = "project";

/** The words that name the project server in a list beside the names of own servers. */
export const PROJECT_SERVER_WORDS = "Project server";

const SERVER_ID = /^[0-9a-f]{16}$/;
const FILES = /^\/api\/servers\/([0-9a-f]{16})\/files\//;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= MOST_NAME;
}

function isCount(value: unknown, least = 0): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= least;
}

function isMoment(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Tell whether a value is the limits of an own server. */
export function isServerLimits(value: unknown): value is ServerLimits {
  return (
    isRecord(value) &&
    isCount(value.running_jobs, 1) &&
    value.running_jobs <= MOST_RUNNING_JOBS &&
    isCount(value.storage) &&
    isCount(value.layer_size)
  );
}

/** Tell whether a value is the state that an own server reports. */
export function isServerState(value: unknown): value is ServerState {
  return (
    isRecord(value) &&
    isCount(value.processors, 1) &&
    (value.memory === null || isCount(value.memory)) &&
    [value.disk_free, value.disk_used, value.running, value.waiting, value.layers].every((count) => isCount(count)) &&
    isServerLimits(value.limits) &&
    isLabel(value.system) &&
    isLabel(value.version)
  );
}

/** Tell whether a value that the project server sent is an own server. */
export function isServer(value: unknown): value is Server {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    SERVER_ID.test(value.id) &&
    isLabel(value.name) &&
    typeof value.connected === "boolean" &&
    isMoment(value.paired) &&
    isMoment(value.seen) &&
    (value.state === null || isServerState(value.state))
  );
}

/** Tell whether a value that the project server sent is the list of the own servers of the visitor. */
export function isServers(value: unknown): value is Servers {
  return isRecord(value) && Array.isArray(value.servers) && value.servers.every(isServer) && isCount(value.limit);
}

/** Tell whether a value that the project server sent is the view of a pairing. */
export function isPairingView(value: unknown): value is PairingView {
  if (!isRecord(value) || typeof value.user_code !== "string" || !USER_CODE.test(value.user_code)) {
    return false;
  }
  const { machine } = value;
  return isRecord(machine) && [machine.name, machine.system, machine.version].every(isLabel);
}

/** Tell whether a value is the own server that the state of a job or an entry of the list of layers names. */
export function isServerName(value: unknown): value is ServerName {
  return isRecord(value) && typeof value.id === "string" && SERVER_ID.test(value.id) && isLabel(value.name);
}

/**
 * Return the name of the own server that keeps the file at an address, or null for a file of the project
 * server. The files of a layer of an own server have the addresses `/api/servers/{server}/files/{layer}/{file}`,
 * and those of the project server `/files/{layer}/{file}`.
 */
export function serverOfAddress(address: string): string | null {
  let path = address;
  try {
    // The address may carry the name of the site before its path.
    path = new URL(address, "https://lynkeus.invalid/").pathname;
  } catch {
    // An address that cannot be read is tried as it is.
  }
  return FILES.exec(path)?.[1] ?? null;
}

/**
 * The own servers of the visitor, as the project server last listed them, or null while they are not known:
 * before the first answer, and while the visitor is not signed in to Earthdata.
 */
export const serversStore = createStore<Servers | null>(null);

/** Return the own server of a name among the servers that are listed, or null. */
export function findServer(id: string | null): Server | null {
  return serversStore.get()?.servers.find((server) => server.id === id) ?? null;
}
