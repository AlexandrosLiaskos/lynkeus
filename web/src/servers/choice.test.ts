import { expect, test } from "vitest";
import { layer } from "../data/testSession";
import { PROJECT_SERVER } from "../shared/servers";
import { automaticServer, chosenOf, holdersOf } from "./choice";
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
