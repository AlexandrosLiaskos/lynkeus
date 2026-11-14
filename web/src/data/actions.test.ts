import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dockStore, resetDock } from "../shared/dock/dock";
import { messagesStore } from "../shared/messages/messages";
import { useDataActions } from "./actions";
import { resetSession, sessionStore } from "./session";
import { earthdata } from "./testSignIn";

beforeEach(() => {
  resetSession();
  resetDock();
  messagesStore.set([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the button Sign in opens the pane of the sign-in", () => {
  const { result } = renderHook(() => useDataActions());
  result.current["sign-in"]?.run();
  expect(dockStore.get().tools).toEqual(["sign-in"]);
});

test("the button Get layer opens the pane of Get layer", () => {
  const { result } = renderHook(() => useDataActions());
  result.current["get-layer"]?.run();
  expect(dockStore.get().tools).toEqual(["get-layer"]);
});

test("the button Sign out signs the visitor out", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
  const { result } = renderHook(() => useDataActions());
  result.current["sign-out"]?.run();
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toHaveLength(1);
  expect(messagesStore.get().map(({ kind }) => kind)).toEqual(["success"]);
});

test("the button Sign out says that nobody is signed in, and sends nothing", () => {
  const server = earthdata();
  sessionStore.set({ state: "signed-out" });
  const { result } = renderHook(() => useDataActions());
  result.current["sign-out"]?.run();
  expect(server.received).toEqual([]);
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["info", "You are not signed in to Earthdata."],
  ]);
});
