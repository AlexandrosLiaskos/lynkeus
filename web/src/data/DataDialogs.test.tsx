// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetServers } from "../servers/requests";
import { openServers, resetServersState } from "../servers/state";
import { openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { DataDialogs } from "./DataDialogs";
import { jobsStore, POLL_TIME, resetJobs } from "./jobs";
import { layersStore, resetLayers } from "./layers";
import { call, onSignInNeeded, SignInCancelled } from "./service";
import { resetSession, sessionStore, signInRequestStore } from "./session";
import { clearProducts, GET_LAYER_PANE, searchDraftStore } from "./state";
import { testMap } from "./testProducts";
import { job, layer, showPage, standIn } from "./testSession";

beforeEach(() => {
  resetDock();
  resetServers();
  resetServersState();
  resetJobs();
  resetLayers();
  resetSession();
  clearProducts();
  searchDraftStore.set(null);
  mapLayersStore.set([]);
  messagesStore.set([]);
  showPage(true);
});

afterEach(() => {
  resetServers();
  resetJobs();
  onSignInNeeded(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <MapContext value={testMap()}>
      <DataDialogs />
    </MapContext>,
  );
}

test("the jobs and the layers of the session are read when the page loads, and a job that ends is announced", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.jobs = [job({ jobID: "a" })];
  server.layers = [{ layer: layer({ id: "old", title: "Old layer" }) }];
  const page = show();
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(jobsStore.get().map(({ jobID }) => jobID)).toEqual(["a"]);
  expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["old"]);
  server.layers = [{ layer: layer({ id: "made" }) }, ...server.layers];
  server.change("a", { status: "successful", progress: 100, layer: "made" });
  await act(() => vi.advanceTimersByTimeAsync(POLL_TIME));
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["made"]);
  expect(messagesStore.get().map(({ kind }) => kind)).toEqual(["success"]);
  page.unmount();
  server.jobs = [job({ jobID: "b" }), ...server.jobs];
  await vi.advanceTimersByTimeAsync(10 * POLL_TIME);
  expect(jobsStore.get()).toHaveLength(1);
});

test("a start of a job that is answered 401 opens the pane of the sign-in with the sentence of the server", async () => {
  const server = standIn();
  show();
  await act(() => Promise.resolve());
  act(() => sessionStore.set({ state: "signed-in", user: "a_user", token: true }));
  server.refuse("POST", "/api/processes", 401, "The job needs your Earthdata token. Sign in again to start it.");
  let outcome: unknown = null;
  act(() => {
    call("/api/processes/get-layer/execution", { method: "POST", content: { inputs: {} } }).then(
      (answer) => {
        outcome = answer;
      },
      (error: unknown) => {
        outcome = error;
      },
    );
  });
  const pane = await screen.findByRole("complementary", { name: "Sign in to Earthdata" });
  expect(pane.querySelector('[role="status"]')?.textContent).toBe(
    "The job needs your Earthdata token. Sign in again to start it. The request continues by itself after the sign-in.",
  );
  // The visitor stays signed in: the loss of the token ends no sign-in and is not reported.
  expect(sessionStore.get().state).toBe("signed-in");
  expect(messagesStore.get()).toEqual([]);
  expect(outcome).toBeNull();
  // Closing the pane gives the request up, with the sentence of the server, and nothing is sent again.
  await userEvent.click(within(pane).getByRole("button", { name: "Close the Sign in to Earthdata pane" }));
  await vi.waitFor(() => expect(outcome).toBeInstanceOf(SignInCancelled));
  expect(outcome).toMatchObject({ message: "The job needs your Earthdata token. Sign in again to start it." });
  expect(signInRequestStore.get()).toBeNull();
  expect(server.sent("POST")).toHaveLength(1);
});

test("the lists of the account are read again when the visitor signs in", async () => {
  const server = standIn();
  show();
  await vi.waitFor(() => expect(server.sent("GET", "/api/layers")).toHaveLength(1));
  server.layers = [{ layer: layer({ id: "mine", title: "Layer of a_user" }) }];
  act(() => sessionStore.set({ state: "signed-in", user: "a_user", token: true }));
  await vi.waitFor(() => expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["mine"]));
});

test("the page holds the pane of Get layer", () => {
  standIn();
  show();
  act(() => openToolPane(GET_LAYER_PANE));
  expect(screen.getByRole("complementary", { name: "Get layer" })).toBeDefined();
});

test("the page holds the pane of the servers", () => {
  standIn();
  show();
  act(() => openServers());
  expect(screen.getByRole("complementary", { name: "Servers" })).toBeDefined();
});
