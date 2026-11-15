// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { layersStore, resetLayers } from "../data/layers";
import { resetSession, sessionStore } from "../data/session";
import { layer, showPage } from "../data/testSession";
import { SAMPLE } from "../header/notice/testLimits";
import { serversStore } from "../shared/servers";
import { resetServers } from "./requests";
import { ABOUT_SERVER, projectRows, ServerField, useServerChoice } from "./ServerField";
import { AUTOMATIC, resetServersState, serverChoiceStore } from "./state";
import { LABORATORY, NEW, OFFICE, OFFICE_NAME, SERVERS, site, type Site } from "./testServers";

let server: Site;

beforeEach(() => {
  resetServers();
  resetServersState();
  resetSession();
  resetLayers();
  showPage(true);
  server = site();
  server.servers = [...SERVERS.servers];
  sessionStore.set({ state: "signed-in", user: "a_user" });
  serversStore.set(SERVERS);
});

afterEach(() => {
  resetServers();
  vi.unstubAllGlobals();
});

/** A form that starts a job: the field, and what the form reads of the choice. */
function Form({ inputs }: { inputs?: readonly string[] }) {
  const { parameter, missing } = useServerChoice(inputs);
  return (
    <>
      <ServerField inputs={inputs} />
      <output aria-label="Parameter">{parameter ?? "none"}</output>
      <output aria-label="Missing">{missing ?? "nothing"}</output>
    </>
  );
}

const field = () => screen.getByLabelText<HTMLSelectElement>("Server");
const parameter = () => screen.getByLabelText("Parameter").textContent;
const lacking = () => screen.getByLabelText("Missing").textContent;
const rows = () =>
  [...document.querySelectorAll(".server-choice .property-row")].map(
    (row) =>
      `${row.querySelector(".property-name")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
const notices = () => [...document.querySelectorAll(".server-choice .notice-text")].map((notice) => notice.textContent);

test("a visitor without an own server has no field, and no parameter is sent", () => {
  serversStore.set({ servers: [], limit: 8 });
  server.servers = [];
  render(<Form />);
  expect(screen.queryByLabelText("Server")).toBeNull();
  expect(parameter()).toBe("none");
  act(() => serversStore.set(null));
  expect(screen.queryByLabelText("Server")).toBeNull();
  expect(lacking()).toBe("nothing");
});

test("the field offers Automatic, the project server and each own server, and marks those that are not connected", () => {
  render(<Form />);
  expect([...field().options].map((option) => [option.value, option.textContent])).toEqual([
    ["automatic", "Automatic"],
    ["project", "Project server"],
    [OFFICE.id, "Office computer"],
    [LABORATORY.id, "Laboratory server (not connected)"],
    [NEW.id, "DESKTOP-7Q2LM4K (not connected)"],
  ]);
  expect(field().value).toBe(AUTOMATIC);
  expect(document.getElementById(field().getAttribute("aria-describedby")?.split(" ")[0] ?? "")?.textContent).toBe(
    ABOUT_SERVER,
  );
  expect(ABOUT_SERVER).toMatch(/^[A-Z][^.]*\.$/);
});

test("the automatic choice sends no parameter and names the server of this moment with its limits", async () => {
  render(<Form />);
  await act(() => Promise.resolve());
  expect(parameter()).toBe("none");
  expect(rows()).toEqual([
    "At present: Office computer",
    "Jobs at the same time: 4 (1 running, 2 waiting)",
    "Largest layer: 10 GB",
    "Most cells of a layer: 100 million",
    "Space for layers: 1.3 GB of 100 GB used",
    "Free disk space: 412 GB",
  ]);
  expect(notices()).toEqual([]);
});

test("the servers are read again when the form opens", async () => {
  server.servers = [LABORATORY];
  render(<Form />);
  await vi.waitFor(() => expect([...field().options]).toHaveLength(3));
  expect(server.sent("GET", "/api/servers")).toHaveLength(1);
  expect(rows()[0]).toBe("At present: Project server");
});

test("the choice of an own server is sent as the parameter, and the limits are those of that server", async () => {
  render(<Form />);
  await userEvent.selectOptions(field(), OFFICE.id);
  expect(parameter()).toBe(OFFICE.id);
  expect(serverChoiceStore.get()).toBe(OFFICE.id);
  expect(rows()).toEqual([
    "Jobs at the same time: 4 (1 running, 2 waiting)",
    "Largest layer: 10 GB",
    "Most cells of a layer: 100 million",
    "Space for layers: 1.3 GB of 100 GB used",
    "Free disk space: 412 GB",
  ]);
  expect(lacking()).toBe("nothing");
});

test("the choice of the project server is sent as the word project, with the limits that the project server states", async () => {
  render(<Form />);
  await userEvent.selectOptions(field(), "project");
  expect(parameter()).toBe("project");
  await vi.waitFor(() =>
    expect(rows()).toEqual([
      "Jobs at the same time: 2 for all visitors",
      "Largest layer: 500 MB",
      "Most cells of a layer: 25 million",
      "Space for layers: 2 GB and 50 layers for one session",
    ]),
  );
  expect(projectRows(SAMPLE)).toHaveLength(4);
  expect(server.sent("GET", "/api/limits")).toHaveLength(1);
});

test("a chosen server that is not connected is what the form lacks, and the field says what to do", async () => {
  render(<Form />);
  await userEvent.selectOptions(field(), LABORATORY.id);
  expect(lacking()).toBe('Choose a server that is connected: "Laboratory server" is not.');
  expect(notices()).toEqual([
    'The server "Laboratory server" is not connected. Start Lynkeus Server on that computer, or choose another server.',
    'The layers of the server "Laboratory server" use 50 GB, and its limit allows 50 GB. Remove layers of that server or raise its limit before a job that makes a layer is started there.',
  ]);
  expect(field().getAttribute("aria-describedby")).toContain("problems");
});

test("a server that has not reported yet says so in the place of its limits", async () => {
  act(() => serversStore.set({ ...SERVERS, servers: [OFFICE, { ...NEW, connected: true }] }));
  server.servers = [OFFICE, { ...NEW, connected: true }];
  render(<Form />);
  await userEvent.selectOptions(field(), NEW.id);
  expect(notices()).toEqual(['The server "DESKTOP-7Q2LM4K" has not reported its state yet.']);
  expect(rows()).toEqual([]);
});

test("a server that disconnects while the form is open is stated at once", async () => {
  render(<Form />);
  await userEvent.selectOptions(field(), OFFICE.id);
  expect(lacking()).toBe("nothing");
  act(() => serversStore.set({ ...SERVERS, servers: [{ ...OFFICE, connected: false }, LABORATORY, NEW] }));
  expect(lacking()).toBe('Choose a server that is connected: "Office computer" is not.');
  expect(field().selectedOptions[0]?.textContent).toBe("Office computer (not connected)");
});

test("the choice of a server that was removed returns to Automatic", async () => {
  render(<Form />);
  await userEvent.selectOptions(field(), OFFICE.id);
  act(() => serversStore.set({ ...SERVERS, servers: [{ ...LABORATORY, connected: true }] }));
  expect(field().value).toBe(AUTOMATIC);
  expect(parameter()).toBe("none");
  expect(rows()[0]).toBe("At present: Laboratory server");
});

test("every form shows and changes the same choice", async () => {
  render(
    <>
      <Form />
      <ServerField />
    </>,
  );
  const [first, second] = screen.getAllByLabelText<HTMLSelectElement>("Server");
  if (!first || !second) {
    throw new Error("The page holds fewer than two fields.");
  }
  await userEvent.selectOptions(second, "project");
  expect(first.value).toBe("project");
  expect(parameter()).toBe("project");
});

test("a tool whose input layers are kept on one own server runs there by itself", async () => {
  layersStore.set([
    { layer: layer({ id: "a" }), size: null, created: null, server: OFFICE_NAME },
    { layer: layer({ id: "b" }), size: null, created: null, server: OFFICE_NAME },
    { layer: layer({ id: "c" }), size: null, created: null, server: null },
  ]);
  render(<Form inputs={["a", "b"]} />);
  await act(() => Promise.resolve());
  expect(rows()[0]).toBe("At present: Office computer");
  expect(notices()).toEqual([]);
  await userEvent.selectOptions(field(), "project");
  expect(notices()).toEqual([
    "An input layer is kept on another server. A tool takes the input layers of the server on which it runs, so choose Automatic or the server of the layers.",
  ]);
  expect(parameter()).toBe("project");
});

test("input layers that are kept on different servers are named before the job is started", async () => {
  layersStore.set([
    { layer: layer({ id: "a" }), size: null, created: null, server: OFFICE_NAME },
    { layer: layer({ id: "c" }), size: null, created: null, server: null },
  ]);
  render(<Form inputs={["a", "c"]} />);
  await act(() => Promise.resolve());
  expect(rows()[0]).toBe("At present: Project server");
  expect(notices()).toEqual([
    "The input layers are kept on different servers. A tool takes the input layers of one server.",
  ]);
});
