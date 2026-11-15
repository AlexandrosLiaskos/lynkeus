// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
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
import { call, onSignInEnded } from "./service";
import { resetSession, sessionStore } from "./session";
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
  onSignInEnded(() => undefined);
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

test("an answer 401 to a request about a job ends the sign-in on the page", async () => {
  const server = standIn();
  show();
  await act(() => Promise.resolve());
  act(() => sessionStore.set({ state: "signed-in", user: "a_user" }));
  server.refuse("POST", "/api/processes", 401, "Sign in to Earthdata to start this job.");
  await act(() => call("/api/processes/get-layer/execution", { method: "POST", content: {} }).catch(() => undefined));
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
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
