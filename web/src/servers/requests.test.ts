import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { onSignInEnded, Refusal } from "../data/service";
import { resetSession, sessionStore, signInEnded } from "../data/session";
import { job, layer, showPage } from "../data/testSession";
import { closeToolPane, dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { serversStore } from "../shared/servers";
import {
  confirmPairing,
  followServers,
  loadServers,
  OPEN_POLL_TIME,
  POLL_TIME,
  readPairing,
  removeServer,
  renameServer,
  resetServers,
  serversFaultStore,
  setServerLimits,
} from "./requests";
import { openAddServer, openServers, resetServersState, returnStore, SERVERS_PANE, serversViewStore } from "./state";
import {
  CHANGE_LIMITS,
  CHANGE_NAME,
  CHANGED,
  CONFIRMATION,
  LABORATORY,
  NEW,
  OFFICE,
  OFFICE_NAME,
  PAIRED,
  SERVERS,
  site,
  VIEW,
  type Site,
} from "./testServers";

let server: Site;
const SIGNED_IN = { state: "signed-in", user: "a_user" } as const;
const names = () => serversStore.get()?.servers.map(({ name }) => name);
const file = (id: string) => `/api/servers/${id}/files/fedcba9876543210fedcba9876543210/backscatter-hh.tif`;

beforeEach(() => {
  resetServers();
  resetServersState();
  resetDock();
  resetSession();
  resetJobs();
  resetLayers();
  mapLayersStore.set([]);
  messagesStore.set([]);
  showPage(true);
  onSignInEnded(signInEnded);
  server = site();
  server.servers = [...SERVERS.servers];
  sessionStore.set(SIGNED_IN);
});

afterEach(() => {
  resetServers();
  resetJobs();
  onSignInEnded(() => undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the servers of the visitor are read and kept, with the most that one user may connect", async () => {
  await loadServers();
  expect(serversStore.get()).toEqual(SERVERS);
  expect(serversFaultStore.get()).toBeNull();
  expect(server.sent("GET", "/api/servers")).toHaveLength(1);
});

test("a list that has not changed keeps its place in the store", async () => {
  await loadServers();
  const first = serversStore.get();
  await loadServers();
  expect(serversStore.get()).toBe(first);
});

test("nothing is asked while the visitor is not signed in to Earthdata", async () => {
  sessionStore.set({ state: "signed-out" });
  await loadServers();
  expect(server.received).toEqual([]);
  expect(serversStore.get()).toBeNull();
});

test("a reading that fails states why, and the list stays as it was", async () => {
  await loadServers();
  server.refuse("GET", "/api/servers", 500, null);
  await loadServers();
  expect(serversFaultStore.get()).toBe("Your servers could not be read (the server answered 500).");
  expect(serversStore.get()).toEqual(SERVERS);
  server.accept();
  await loadServers();
  expect(serversFaultStore.get()).toBeNull();
});

test("an answer of another form is reported as unreadable", async () => {
  server.refuse("GET", "/api/servers", 200, "not a list");
  await loadServers();
  expect(serversFaultStore.get()).toBe("The answer of the server could not be read.");
});

test("an answer 401 ends the sign-in on the page, and the servers are forgotten", async () => {
  await loadServers();
  server.user = null;
  await loadServers();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(serversStore.get()).toBeNull();
  expect(serversFaultStore.get()).toBeNull();
  expect(messagesStore.get().map(({ kind }) => kind)).toEqual(["warning"]);
});

test("a server is renamed with the change that the format of the server describes", async () => {
  await loadServers();
  const renamed = await renameServer(OFFICE.id, CHANGE_NAME.name);
  expect(server.sent("PATCH")).toEqual([
    { method: "PATCH", address: `/api/servers/${OFFICE.id}`, content: CHANGE_NAME },
  ]);
  expect(renamed.name).toBe("Field laptop");
  expect(names()).toEqual(["Field laptop", "Laboratory server", "DESKTOP-7Q2LM4K"]);
});

test("the limits of a server are sent in bytes, and the list shows them once the server reports them", async () => {
  await loadServers();
  await renameServer(OFFICE.id, CHANGE_NAME.name);
  const limited = await setServerLimits(OFFICE.id, CHANGE_LIMITS.limits);
  expect(server.sent("PATCH").at(-1)?.content).toEqual(CHANGE_LIMITS);
  expect(limited).toEqual({ ...OFFICE, name: "Field laptop" });
  expect(serversStore.get()?.servers[0]).toEqual(limited);
  server.apply(OFFICE.id);
  await loadServers();
  expect(serversStore.get()?.servers[0]).toEqual(CHANGED);
});

test("a change that the server refuses is rejected with the sentence of the server", async () => {
  await loadServers();
  server.refuse("PATCH", "/api/servers", 503, "The server is not connected, so its limits cannot be set now.");
  const refusal = await setServerLimits(LABORATORY.id, CHANGE_LIMITS.limits).catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(Refusal);
  expect((refusal as Refusal).message).toBe("The server is not connected, so its limits cannot be set now.");
  expect(serversStore.get()).toEqual(SERVERS);
});

test("a removed server leaves the list, its layers leave the map, and the lists of the session are read again", async () => {
  await loadServers();
  const kept = layer({ id: "kept" });
  const gone = layer({ id: "gone", url: file(OFFICE.id), record: file(OFFICE.id).replace(".tif", ".json") });
  mapLayersStore.set([kept, gone]);
  server.layers = [{ layer: gone, server: OFFICE_NAME }, { layer: kept }];
  server.jobs = [job({ jobID: "a" })];
  await removeServer(OFFICE.id);
  expect(server.sent("DELETE")).toEqual([
    { method: "DELETE", address: `/api/servers/${OFFICE.id}`, content: undefined },
  ]);
  expect(names()).toEqual(["Laboratory server", "DESKTOP-7Q2LM4K"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["kept"]);
  await vi.waitFor(() => expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["kept"]));
  await vi.waitFor(() => expect(jobsStore.get()).toHaveLength(1));
});

test("a server that the project server no longer holds leaves the list as well", async () => {
  await loadServers();
  server.servers = server.servers.filter(({ id }) => id !== NEW.id);
  await removeServer(NEW.id);
  expect(names()).toEqual(["Office computer", "Laboratory server"]);
});

test("a removal that the server refuses leaves the server in the list", async () => {
  await loadServers();
  server.refuse("DELETE", "/api/servers", 500, null);
  await expect(removeServer(OFFICE.id)).rejects.toThrow("The server could not be removed (the server answered 500).");
  expect(names()).toHaveLength(3);
});

test("a slow answer to a reading does not bring back a server that was removed meanwhile", async () => {
  await loadServers();
  const reading = loadServers();
  await removeServer(OFFICE.id);
  await reading;
  expect(names()).toEqual(["Laboratory server", "DESKTOP-7Q2LM4K"]);
});

test("the view of a pairing names the computer of a code", async () => {
  server.pairings = { [VIEW.user_code]: VIEW };
  expect(await readPairing(VIEW.user_code)).toEqual(VIEW);
  expect(server.sent("GET").at(-1)?.address).toBe("/api/servers/pairings/WDJB-MJHT");
});

test("an unknown code is refused with the status 404", async () => {
  const refusal = await readPairing("BCDF-GHJK").catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(Refusal);
  expect((refusal as Refusal).status).toBe(404);
});

test("a confirmed pairing sends the code and adds the server to the list", async () => {
  server.servers = [OFFICE];
  server.pairings = { [VIEW.user_code]: VIEW };
  await loadServers();
  const added = await confirmPairing(VIEW.user_code);
  expect(server.sent("POST")).toEqual([{ method: "POST", address: "/api/servers", content: CONFIRMATION }]);
  expect(added).toEqual(PAIRED);
  expect(names()).toEqual(["Office computer", "DESKTOP-7Q2LM4K"]);
});

test("a pairing beyond the most servers of one user is refused with the status 409", async () => {
  server.pairings = { [VIEW.user_code]: VIEW };
  server.limit = 3;
  const refusal = await confirmPairing(VIEW.user_code).catch((error: unknown) => error);
  expect((refusal as Refusal).status).toBe(409);
});

test("the servers are read when the page loads and every half minute while the visitor has one", async () => {
  vi.useFakeTimers();
  const stop = followServers();
  await vi.advanceTimersByTimeAsync(0);
  expect(server.sent("GET", "/api/servers")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  expect(server.sent("GET", "/api/servers")).toHaveLength(2);
  showPage(false);
  await vi.advanceTimersByTimeAsync(3 * POLL_TIME);
  expect(server.sent("GET", "/api/servers")).toHaveLength(2);
  showPage(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(server.sent("GET", "/api/servers")).toHaveLength(3);
  stop();
  await vi.advanceTimersByTimeAsync(3 * POLL_TIME);
  expect(server.sent("GET", "/api/servers")).toHaveLength(3);
});

test("a visitor without a server is asked about again only while the pane of the servers is open", async () => {
  vi.useFakeTimers();
  server.servers = [];
  const stop = followServers();
  await vi.advanceTimersByTimeAsync(3 * POLL_TIME);
  expect(server.sent("GET", "/api/servers")).toHaveLength(1);
  openServers();
  await vi.advanceTimersByTimeAsync(0);
  expect(server.sent("GET", "/api/servers")).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(OPEN_POLL_TIME);
  expect(server.sent("GET", "/api/servers")).toHaveLength(3);
  closeToolPane(SERVERS_PANE);
  await vi.advanceTimersByTimeAsync(3 * POLL_TIME);
  expect(server.sent("GET", "/api/servers")).toHaveLength(3);
  stop();
});

test("a sign-in reads the servers and the lists of the session, and a sign-out forgets the servers", async () => {
  sessionStore.set({ state: "signed-out" });
  server.layers = [{ layer: layer({ id: "own" }), server: OFFICE_NAME }];
  const stop = followServers();
  await Promise.resolve();
  expect(server.received).toEqual([]);
  sessionStore.set(SIGNED_IN);
  await vi.waitFor(() => expect(serversStore.get()).toEqual(SERVERS));
  await vi.waitFor(() => expect(layersStore.get().map((entry) => entry.server)).toEqual([OFFICE_NAME]));
  expect(server.sent("GET", "/api/jobs")).toHaveLength(1);
  server.layers = [];
  sessionStore.set({ state: "signed-out" });
  expect(serversStore.get()).toBeNull();
  await vi.waitFor(() => expect(layersStore.get()).toEqual([]));
  expect(server.sent("GET", "/api/jobs")).toHaveLength(2);
  stop();
});

test("the first answer about the session does not read the lists of the session again", async () => {
  resetSession();
  const stop = followServers();
  sessionStore.set(SIGNED_IN);
  await vi.waitFor(() => expect(serversStore.get()).toEqual(SERVERS));
  expect(server.sent("GET", "/api/layers")).toEqual([]);
  stop();
});

test("a pane that the visitor left for the sign-in comes to the front again after it, with its code", () => {
  sessionStore.set({ state: "signed-out" });
  const stop = followServers();
  openAddServer("WDJB-MJHT");
  // The button Sign in of the pane: the pane of the sign-in comes to the front, and the pane of the servers waits.
  returnStore.set(true);
  openToolPane("sign-in");
  expect(dockStore.get().front.right).toBe("sign-in");
  sessionStore.set(SIGNED_IN);
  expect(dockStore.get().front.right).toBe(SERVERS_PANE);
  expect(dockStore.get().focus).toEqual({ id: SERVERS_PANE });
  expect(serversViewStore.get()).toEqual({ view: "add", code: "WDJB-MJHT" });
  expect(returnStore.get()).toBe(false);
  stop();
});

test("a sign-in that the pane of the servers did not ask for leaves the panes as they are", () => {
  sessionStore.set({ state: "signed-out" });
  const stop = followServers();
  openToolPane("sign-in");
  sessionStore.set(SIGNED_IN);
  expect(dockStore.get().tools).toEqual(["sign-in"]);
  stop();
});
