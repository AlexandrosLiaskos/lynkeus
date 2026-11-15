import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import confirmation from "../../../api/tests/data/servers/pairing-confirmation.json";
import view from "../../../api/tests/data/servers/pairing-view.json";
import changed from "../../../api/tests/data/servers/server-changed.json";
import name from "../../../api/tests/data/servers/server-name.json";
import paired from "../../../api/tests/data/servers/server-paired.json";
import list from "../../../api/tests/data/servers/servers.json";
import {
  isPairingView,
  isServer,
  FIRST_LAYER_CELLS,
  isServerLimits,
  isServerName,
  isServers,
  isServerState,
  layerCells,
  LEAST_LAYER_CELLS,
  MOST_LAYER_CELLS,
  MOST_NAME,
  MOST_RUNNING_JOBS,
  PAIRING_TIME,
  runsOlderProgram,
  serverOfAddress,
  USER_CODE,
} from "./servers";

// The formats of the server, which this file writes again as checks.
const linking = readFileSync("../api/src/lynkeus/linking.py", "utf8");

test("the example messages of the server have the form that the interface accepts", () => {
  expect(isServers(list)).toBe(true);
  expect(isServer(paired)).toBe(true);
  expect(isServer(changed)).toBe(true);
  expect(isPairingView(view)).toBe(true);
  expect(isServerName(name)).toBe(true);
  expect(USER_CODE.test(confirmation.user_code)).toBe(true);
});

test("the examples hold a server that is connected, one that is not, and one that has not reported yet", () => {
  expect(list.servers.map(({ connected }) => connected)).toEqual([true, false, false]);
  expect(list.servers.map(({ state }) => state === null)).toEqual([false, false, true]);
  expect(list.servers[1]?.state?.memory).toBeNull();
});

test("the limits written here are those of the formats of the server", () => {
  expect(linking).toContain(`PAIRING_TIME = ${String(PAIRING_TIME)}\n`);
  expect(linking).toContain(`running_jobs: int = Field(ge=1, le=${String(MOST_RUNNING_JOBS)})`);
  expect(linking).toContain(`type Label = Annotated[str, Field(min_length=1, max_length=${String(MOST_NAME)})]`);
  expect(linking).toContain(`Field(pattern=r"${USER_CODE.source}")`);
  // Python writes the numbers with an underscore between the groups of three digits.
  const python = (count: number) => count.toLocaleString("en-US").replaceAll(",", "_");
  expect(linking).toContain(`FIRST_LAYER_CELLS = ${python(FIRST_LAYER_CELLS)}\n`);
  expect(linking).toContain(
    `layer_cells: int = Field(default=FIRST_LAYER_CELLS, ge=${python(LEAST_LAYER_CELLS)}, le=${python(MOST_LAYER_CELLS)})`,
  );
});

test("limits state the most cells of a layer, and limits of the older program, which lack them, count as 25 million", () => {
  const [stated, old] = list.servers.map((server) => server.state);
  if (!stated || !old || !isServerState(stated) || !isServerState(old)) {
    throw new Error("The first two servers of the example report their state.");
  }
  // The older and the newer program carry the same version, so the version does not tell them apart.
  expect(stated.version).toBe(old.version);
  expect(layerCells(stated.limits)).toBe(100_000_000);
  expect("layer_cells" in old.limits).toBe(false);
  expect(layerCells(old.limits)).toBe(FIRST_LAYER_CELLS);
  expect(FIRST_LAYER_CELLS).toBe(25_000_000);
  const limits = { running_jobs: 1, storage: 0, layer_size: 0 };
  expect(isServerLimits({ ...limits, layer_cells: LEAST_LAYER_CELLS })).toBe(true);
  expect(isServerLimits({ ...limits, layer_cells: MOST_LAYER_CELLS })).toBe(true);
  expect(isServerLimits({ ...limits, layer_cells: LEAST_LAYER_CELLS - 1 })).toBe(false);
  expect(isServerLimits({ ...limits, layer_cells: MOST_LAYER_CELLS + 1 })).toBe(false);
  expect(isServerLimits({ ...limits, layer_cells: 25_000_000.5 })).toBe(false);
  expect(isServerLimits({ ...limits, layer_cells: null })).toBe(false);
});

test("a server runs the older program when the project server says that its last report lacked the cells", () => {
  if (!isServers(list)) {
    throw new Error("The example servers.json has the form of the list of the servers.");
  }
  // The first server reported the limit, the second reported limits without it, and the third has not reported.
  expect(list.servers.map(({ knows_cells }) => knows_cells)).toEqual([true, false, false]);
  expect(list.servers.map((server) => runsOlderProgram(server))).toEqual([false, true, false]);
});

test("a server with a wrong field is not accepted", () => {
  const [server] = list.servers;
  expect(isServer({ ...server, id: "3F9A1C0B7E24D658" })).toBe(false);
  expect(isServer({ ...server, id: "3f9a1c0b7e24d65" })).toBe(false);
  expect(isServer({ ...server, name: "" })).toBe(false);
  expect(isServer({ ...server, name: "n".repeat(MOST_NAME + 1) })).toBe(false);
  expect(isServer({ ...server, connected: "yes" })).toBe(false);
  expect(isServer({ ...server, seen: "2026-11-15T09:40:12Z" })).toBe(false);
  expect(isServer({ ...server, state: undefined })).toBe(false);
  expect(isServer({ ...server, knows_cells: undefined })).toBe(false);
  expect(isServer({ ...server, knows_cells: "true" })).toBe(false);
  expect(isServers({ servers: [server] })).toBe(false);
  expect(isServers({ servers: [server, null], limit: 8 })).toBe(false);
  expect(isServers(null)).toBe(false);
});

test("a state and limits with a wrong number are not accepted", () => {
  const state = list.servers[0]?.state;
  expect(isServerState(state)).toBe(true);
  expect(isServerState({ ...state, processors: 0 })).toBe(false);
  expect(isServerState({ ...state, memory: undefined })).toBe(false);
  expect(isServerState({ ...state, disk_free: -1 })).toBe(false);
  expect(isServerState({ ...state, waiting: 1.5 })).toBe(false);
  expect(isServerState({ ...state, system: "" })).toBe(false);
  expect(isServerLimits({ running_jobs: 1, storage: 0, layer_size: 0 })).toBe(true);
  expect(isServerLimits({ running_jobs: 0, storage: 0, layer_size: 0 })).toBe(false);
  expect(isServerLimits({ running_jobs: MOST_RUNNING_JOBS + 1, storage: 0, layer_size: 0 })).toBe(false);
  expect(isServerLimits({ running_jobs: 2, storage: -1, layer_size: 0 })).toBe(false);
  expect(isServerLimits({ running_jobs: 2, storage: 10 })).toBe(false);
});

test("the view of a pairing needs a code of the right form and the three statements of the computer", () => {
  expect(isPairingView({ ...view, user_code: "wdjb-mjht" })).toBe(false);
  expect(isPairingView({ ...view, user_code: "WDJA-MJHT" })).toBe(false);
  expect(isPairingView({ ...view, machine: { name: "PC", system: "Windows 11" } })).toBe(false);
  expect(isPairingView({ user_code: view.user_code })).toBe(false);
  expect(isServerName({ id: "3f9a1c0b7e24d658" })).toBe(false);
  expect(isServerName(null)).toBe(false);
});

test("the address of a file names the own server that keeps it, and a file of the project server names none", () => {
  const id = "3f9a1c0b7e24d658";
  const layer = "fedcba9876543210fedcba9876543210";
  expect(serverOfAddress(`/api/servers/${id}/files/${layer}/backscatter-hh.tif`)).toBe(id);
  expect(serverOfAddress(`https://lynkeus.nkua.cloud/api/servers/${id}/files/${layer}/backscatter-hh.json`)).toBe(id);
  expect(serverOfAddress(`/files/${layer}/backscatter-hh.tif`)).toBeNull();
  expect(serverOfAddress(`/api/servers/${id}`)).toBeNull();
  expect(serverOfAddress(`/api/servers/not-a-server/files/${layer}/backscatter-hh.tif`)).toBeNull();
  expect(serverOfAddress("")).toBeNull();
});
