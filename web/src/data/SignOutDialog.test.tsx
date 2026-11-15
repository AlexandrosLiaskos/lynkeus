// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { keptStore, resetKept, restoreKept, statesStore } from "../contents/kept";
import { LAYERS_KEY } from "../contents/storedLayers";
import { testLayer } from "../map/testLayer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { OPTIONS_KEY, resetStorage, setPartKept, storageStore } from "../shared/storage/storage";
import { resetAgain } from "./again";
import { resetJobs } from "./jobs";
import { layersReadStore, layersStore, resetLayers } from "./layers";
import { askSignOut, resetSession, sessionStore, signOutDialogStore } from "./session";
import { SIGN_OUT_WORDS, SignOutDialog } from "./SignOutDialog";
import { earthdata, type Earthdata } from "./testSignIn";

const ONE = testLayer("one", "Backscatter of 21 October");
const TWO = testLayer("two", "Backscatter of 2 November");

let server: Earthdata;
const reload = vi.fn();

/** The page of a visitor who is signed in as a_user and has two layers of the account on the map. */
function show(): void {
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  layersStore.set([ONE, TWO].map((layer) => ({ layer, size: null, created: null, server: null })));
  layersReadStore.set({ account: "a_user" });
  [ONE, TWO].forEach(addToMap);
  render(
    <>
      <button type="button" onClick={askSignOut}>
        Sign out of the ribbon
      </button>
      <SignOutDialog reload={reload} />
    </>,
  );
}

const dialog = () => screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
const command = (name: string) => within(dialog()).getByRole("button", { name });
const box = () => within(dialog()).getByRole<HTMLInputElement>("checkbox", { name: SIGN_OUT_WORDS.clear });
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);
const storedKeys = () =>
  Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).sort();

beforeEach(() => {
  resetKept();
  mapLayersStore.set([]);
  resetSession();
  resetLayers();
  resetJobs();
  resetAgain();
  resetKept();
  messagesStore.set([]);
  window.localStorage.clear();
  resetStorage();
  reload.mockReset();
  server = earthdata("a_user");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the dialog is closed until a command Sign out opens it, and nothing is sent before the visitor confirms", async () => {
  show();
  expect(dialog().open).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Sign out of the ribbon" }));
  expect(dialog().open).toBe(true);
  expect(screen.getByRole("heading", { name: "Sign out of Earthdata" })).toBeDefined();
  expect(server.received).toEqual([]);
});

test("the dialog says what stays on the project server and what happens to the map of this browser", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "Sign out of the ribbon" }));
  expect([...dialog().querySelectorAll("p")].map((sentence) => sentence.textContent)).toEqual([
    "The layers, the series and the jobs of the account a_user stay on the project server for this account until the date that each one states. Jobs that were already started go on.",
    "The layers of the map of this browser are not shown after the sign-out. They return, in their order and with their display, at the next sign-in to this account.",
  ]);
  // The choice for a shared computer is not made for the visitor, and its explanation stands behind an "i".
  expect(box().checked).toBe(false);
  expect(SIGN_OUT_WORDS.clear).toBe("Also remove what this browser keeps");
  expect(document.getElementById(box().getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    SIGN_OUT_WORDS.aboutClear,
  );
  expect(SIGN_OUT_WORDS.aboutClear).toMatch(/^Choose this on a computer that other people use\./);
  // The dialog has one filled button.
  expect(dialog().querySelectorAll(".usa-button:not(.usa-button--unstyled, .usa-modal__close)")).toHaveLength(1);
});

test("Sign out signs out, and no layer of the account is drawn; the browser keeps the map for the next sign-in", async () => {
  show();
  askSignOut();
  await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toEqual([{ method: "DELETE", address: "/api/session/earthdata", content: undefined }]);
  expect(messages()).toEqual([["success", "You are signed out of Earthdata. Jobs that were already started go on."]]);
  await vi.waitFor(() => expect(dialog().open).toBe(false));
  expect(signOutDialogStore.get()).toBe(false);
  expect(mapLayersStore.get()).toEqual([]);
  expect(statesStore.get()).toEqual({ one: "waits", two: "waits" });
  expect(JSON.parse(window.localStorage.getItem(LAYERS_KEY) ?? "null")).toMatchObject({
    value: { layers: [ONE, TWO], accounts: { one: "a_user", two: "a_user" } },
  });
  expect(reload).not.toHaveBeenCalled();
});

test("with the choice for a shared computer, the stored parts and the layers of the page are removed and the page is loaded anew", async () => {
  show();
  // The visitor has set a switch of the storage, so the browser holds the options.
  setPartKept("lynkeus.area", true);
  expect(storedKeys()).toContain(LAYERS_KEY);
  askSignOut();
  await userEvent.click(await screen.findByRole("checkbox", { name: SIGN_OUT_WORDS.clear }));
  await userEvent.click(command("Sign out"));
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  // Only the options of the storage stay, because they hold the choices of the visitor about it.
  expect(storedKeys()).toEqual([OPTIONS_KEY]);
  expect(keptStore.get()).toEqual([]);
  expect(mapLayersStore.get()).toEqual([]);
  expect(storageStore.get().parts.every(({ bytes }) => bytes === null)).toBe(true);
});

test("the empty map is stored before the storage is cleared, so that another window empties its map", async () => {
  show();
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  askSignOut();
  await userEvent.click(await screen.findByRole("checkbox", { name: SIGN_OUT_WORDS.clear }));
  await userEvent.click(command("Sign out"));
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  const maps = setItem.mock.calls.filter(([key]) => key === LAYERS_KEY).map(([, text]) => text);
  setItem.mockRestore();
  expect(JSON.parse(maps.at(-1) ?? "null")).toMatchObject({ value: { layers: [] } });
});

test("a sign-out that fails removes nothing, also with the choice for a shared computer", async () => {
  server.refusal.DELETE = { status: 500, content: { detail: "The sign-out could not be recorded." } };
  show();
  askSignOut();
  await userEvent.click(await screen.findByRole("checkbox", { name: SIGN_OUT_WORDS.clear }));
  await userEvent.click(command("Sign out"));
  await vi.waitFor(() => expect(messages()).toEqual([["error", "The sign-out could not be recorded."]]));
  expect(sessionStore.get().state).toBe("signed-in");
  expect(mapLayersStore.get()).toEqual([ONE, TWO]);
  expect(storedKeys()).toContain(LAYERS_KEY);
  expect(reload).not.toHaveBeenCalled();
});

test("Cancel closes the dialog and changes nothing, and the choice is not kept for the next time", async () => {
  show();
  askSignOut();
  await userEvent.click(await screen.findByRole("checkbox", { name: SIGN_OUT_WORDS.clear }));
  await userEvent.click(command("Cancel"));
  expect(dialog().open).toBe(false);
  expect(server.received).toEqual([]);
  expect(sessionStore.get().state).toBe("signed-in");
  expect(mapLayersStore.get()).toEqual([ONE, TWO]);
  askSignOut();
  expect((await screen.findByRole<HTMLInputElement>("checkbox", { name: SIGN_OUT_WORDS.clear })).checked).toBe(false);
});

test("a visitor who signs out without the token is signed out as any other", async () => {
  server.token = false;
  sessionStore.set({ state: "signed-in", user: "a_user", token: false });
  render(<SignOutDialog reload={reload} />);
  askSignOut();
  await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
});

test("layers of another account that wait in this browser are removed with the rest", async () => {
  show();
  restoreKept([
    { layer: ONE, account: "a_user", source: null },
    { layer: testLayer("other", "Layer of another account"), account: "b_user", source: null },
  ]);
  expect(statesStore.get()).toEqual({ one: "ready", other: "waits" });
  askSignOut();
  await userEvent.click(await screen.findByRole("checkbox", { name: SIGN_OUT_WORDS.clear }));
  await userEvent.click(command("Sign out"));
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(keptStore.get()).toEqual([]);
});
