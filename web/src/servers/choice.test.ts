// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { layer } from "../data/testSession";
import { PROJECT_SERVER } from "../shared/servers";
import { automaticServer, cellsLimitOf, chosenOf, holdersOf } from "./choice";
import { AUTOMATIC, serverParameter, validChoice } from "./state";
import { LABORATORY, NEW, OFFICE, OFFICE_NAME, SERVERS } from "./testServers";

const ALL = SERVERS.servers;
const entry = (id: string, server: typeof OFFICE_NAME | null) => ({
  layer: layer({ id }),
  size: null,
  created: null,
  server,
});

test("the choice of a server that is no longer listed becomes the automatic choice", () => {
  expect(validChoice(OFFICE.id, ALL)).toBe(OFFICE.id);
  expect(validChoice(PROJECT_SERVER, [])).toBe(PROJECT_SERVER);
  expect(validChoice(OFFICE.id, [LABORATORY])).toBe(AUTOMATIC);
  expect(validChoice("", ALL)).toBe(AUTOMATIC);
});

test("the automatic choice sends no parameter, and every other choice sends itself", () => {
  expect(serverParameter(AUTOMATIC)).toBeUndefined();
  expect(serverParameter(PROJECT_SERVER)).toBe("project");
  expect(serverParameter(OFFICE.id)).toBe(OFFICE.id);
});

test("each input layer names the server that keeps it", () => {
  const entries = [entry("a", OFFICE_NAME), entry("b", null)];
  expect(holdersOf(["a", "b", "gone"], entries)).toEqual([OFFICE.id, null, null]);
  expect(holdersOf([], entries)).toEqual([]);
});

test("without the parameter the job goes to the connected own server with the fewest unfinished jobs", () => {
  const idle = { ...LABORATORY, connected: true };
  expect(automaticServer(ALL, [])).toBe(OFFICE);
  expect(automaticServer([OFFICE, idle], [])).toBe(idle);
  expect(automaticServer([idle, { ...NEW, connected: true }], [])).toBe(idle);
  expect(automaticServer([LABORATORY, NEW], [])).toBeNull();
  expect(automaticServer([], [])).toBeNull();
});

test("without the parameter a tool runs on the server that keeps every input layer", () => {
  const idle = { ...LABORATORY, connected: true };
  expect(automaticServer([OFFICE, idle], [OFFICE.id, OFFICE.id])).toBe(OFFICE);
  expect(automaticServer([OFFICE, idle], [null])).toBeNull();
  expect(automaticServer([OFFICE, idle], [OFFICE.id, idle.id])).toBeNull();
  expect(automaticServer(ALL, [LABORATORY.id])).toBeNull();
});

test("the automatic choice names the server of this moment and lacks nothing", () => {
  expect(chosenOf(AUTOMATIC, ALL, [])).toEqual({
    choice: AUTOMATIC,
    parameter: undefined,
    server: OFFICE,
    missing: null,
    apart: null,
  });
  expect(chosenOf(AUTOMATIC, [LABORATORY], []).server).toBeNull();
  expect(chosenOf("gone", ALL, []).choice).toBe(AUTOMATIC);
});

test("the choice of the project server or of an own server is sent as the parameter", () => {
  expect(chosenOf(PROJECT_SERVER, ALL, [])).toEqual({
    choice: PROJECT_SERVER,
    parameter: "project",
    server: null,
    missing: null,
    apart: null,
  });
  expect(chosenOf(OFFICE.id, ALL, [OFFICE.id])).toEqual({
    choice: OFFICE.id,
    parameter: OFFICE.id,
    server: OFFICE,
    missing: null,
    apart: null,
  });
});

test("a chosen server that is not connected is what the form lacks", () => {
  expect(chosenOf(LABORATORY.id, ALL, []).missing).toBe(
    'Choose a server that is connected: "Laboratory server" is not.',
  );
});

test("input layers that are not kept on the server of the job are named before the server refuses them", () => {
  const other =
    "An input layer is kept on another server. A tool takes the input layers of the server on which it runs, so choose Automatic or the server of the layers.";
  expect(chosenOf(PROJECT_SERVER, ALL, [OFFICE.id]).apart).toBe(other);
  expect(chosenOf(OFFICE.id, ALL, [OFFICE.id, null]).apart).toBe(other);
  expect(chosenOf(PROJECT_SERVER, ALL, [null, null]).apart).toBeNull();
  expect(chosenOf(AUTOMATIC, ALL, [OFFICE.id, null]).apart).toBe(
    "The input layers are kept on different servers. A tool takes the input layers of one server.",
  );
  expect(chosenOf(AUTOMATIC, ALL, [OFFICE.id, OFFICE.id]).apart).toBeNull();
});

/** A server of the examples with another limit on the cells of a layer, another name and another id. */
function withCells(server: typeof OFFICE, cells: number, name = server.name, id = server.id): typeof OFFICE {
  return {
    ...server,
    id,
    name,
    state: server.state && { ...server.state, limits: { ...server.state.limits, layer_cells: cells } },
  };
}

test("a visitor without a server has the limit of the project server on the cells of a layer", () => {
  expect(cellsLimitOf(null, [], 25_000_000)).toEqual({
    limit: 25_000_000,
    server: null,
    several: false,
    larger: null,
  });
  // Before the description of the process is read the limit is not known, and the form refuses nothing.
  expect(cellsLimitOf(null, [], null).limit).toBeNull();
});

test("the limit on the cells is the one of the server chosen, or of the server that Automatic names", () => {
  expect(cellsLimitOf(chosenOf(OFFICE.id, ALL, []), ALL, 25_000_000)).toEqual({
    limit: 100_000_000,
    server: "Office computer",
    several: true,
    larger: null,
  });
  expect(cellsLimitOf(chosenOf(AUTOMATIC, ALL, []), ALL, 25_000_000)).toMatchObject({
    limit: 100_000_000,
    server: "Office computer",
  });
  // Automatic names the project server when no server of the visitor is connected.
  expect(cellsLimitOf(chosenOf(AUTOMATIC, [LABORATORY, NEW], []), [LABORATORY, NEW], 25_000_000)).toEqual({
    limit: 25_000_000,
    server: null,
    several: true,
    larger: null,
  });
});

test("a server with the older program, and one that has not reported yet, count as 25 million cells", () => {
  expect(cellsLimitOf(chosenOf(LABORATORY.id, ALL, []), ALL, 10_000_000).limit).toBe(25_000_000);
  expect(cellsLimitOf(chosenOf(NEW.id, ALL, []), ALL, 10_000_000).limit).toBe(25_000_000);
});

test("the connected server of the visitor that receives the most cells is named when it receives more", () => {
  expect(cellsLimitOf(chosenOf(PROJECT_SERVER, ALL, []), ALL, 25_000_000)).toEqual({
    limit: 25_000_000,
    server: null,
    several: true,
    larger: { name: "Office computer", limit: 100_000_000 },
  });
  // A server that is not connected is not named, whatever its limit.
  const away = withCells(LABORATORY, 500_000_000);
  expect(cellsLimitOf(chosenOf(PROJECT_SERVER, [away], []), [away], 25_000_000).larger).toBeNull();
  // Of two connected servers that receive more, the one that receives the most is named.
  const small = withCells(OFFICE, 30_000_000, "Field laptop", "1111111111111111");
  const large = withCells(OFFICE, 400_000_000, "Workstation", "2222222222222222");
  const three = [small, OFFICE, large];
  expect(cellsLimitOf(chosenOf(small.id, three, []), three, 25_000_000)).toEqual({
    limit: 30_000_000,
    server: "Field laptop",
    several: true,
    larger: { name: "Workstation", limit: 400_000_000 },
  });
  expect(cellsLimitOf(chosenOf(large.id, three, []), three, 25_000_000).larger).toBeNull();
  // The project server is not known yet: no server is named as the larger one.
  expect(cellsLimitOf(chosenOf(PROJECT_SERVER, ALL, []), ALL, null)).toMatchObject({ limit: null, larger: null });
});
