// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dockStore, resetDock } from "../shared/dock/dock";
import { messagesStore } from "../shared/messages/messages";
import { resetServersState, serversViewStore } from "../servers/state";
import { EarthdataAccount, TOKEN_WORDS } from "./EarthdataAccount";
import { resetSession, sessionStore, signOutDialogStore } from "./session";
import { SignOutDialog } from "./SignOutDialog";
import { earthdata } from "./testSignIn";

/** The title bar with the account, and an element after it that can take the keyboard focus. */
function Bar() {
  return (
    <>
      <header>
        <EarthdataAccount />
      </header>
      <main tabIndex={0} aria-label="Map" />
      <SignOutDialog reload={vi.fn()} />
    </>
  );
}

const account = (name: string) => screen.getByRole("button", { name });

/** Press Sign out in the dialog that says what stays where. */
async function confirmSignOut(): Promise<void> {
  const dialog = await screen.findByRole("dialog", { name: "Sign out of Earthdata" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
}

function messages(): [string, string][] {
  return messagesStore.get().map(({ kind, text }) => [kind, text]);
}

beforeEach(() => {
  resetSession();
  resetServersState();
  resetDock();
  messagesStore.set([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("nothing is shown before the server has answered", () => {
  render(<Bar />);
  expect(screen.queryByRole("button")).toBeNull();
});

test("while nobody is signed in the title bar says so, and a press opens the pane of the sign-in", async () => {
  sessionStore.set({ state: "signed-out" });
  render(<Bar />);
  const button = account("Earthdata: not signed in");
  // The button shows the picture of an account alone, and its name stands in its tooltip.
  expect(button.textContent).toBe("");
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(screen.getByRole("tooltip", { hidden: true }).textContent).toBe("Earthdata: not signed in");
  expect(button.getAttribute("aria-expanded")).toBeNull();
  await userEvent.click(button);
  expect(dockStore.get().tools).toEqual(["sign-in"]);
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("when the server did not answer the title bar says that the sign-in is not known", async () => {
  sessionStore.set({ state: "unreachable" });
  render(<Bar />);
  await userEvent.click(account("Earthdata: sign-in not known"));
  expect(dockStore.get().tools).toEqual(["sign-in"]);
});

test("while the visitor is signed in the title bar shows the user name, and a press opens the menu", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  const button = account("Earthdata: a_user");
  expect(button.textContent).toBe("");
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  await userEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  const menu = document.getElementById(button.getAttribute("aria-controls") ?? "");
  expect(menu?.textContent).toBe(`Signed in to Earthdata as a_user${TOKEN_WORDS.held}ServersSign out`);
  expect(TOKEN_WORDS.held).toBe("The project server holds your token and requests data from NASA in your name.");
  expect(dockStore.get().tools).toEqual([]);
  // The opening of the menu asks the server whether the sign-in still stands.
  expect(server.sent("GET")).toHaveLength(1);
  await userEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("the command Sign out of the menu signs out, closes the menu and leaves the focus on the button", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  // The command opens the dialog of Sign out and closes the menu. Nothing is sent before the visitor confirms.
  expect(signOutDialogStore.get()).toBe(true);
  expect(server.sent("DELETE")).toEqual([]);
  await confirmSignOut();
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toHaveLength(1);
  expect(messages()).toEqual([["success", "You are signed out of Earthdata. Jobs that were already started go on."]]);
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(document.activeElement).toBe(account("Earthdata: not signed in"));
});

test("the Escape key closes the menu and returns the focus to the button", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  screen.getByRole("button", { name: "Sign out" }).focus();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(document.activeElement).toBe(account("Earthdata: a_user"));
});

test("a press outside the menu closes it", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("main"));
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("the menu closes when the sign-in ends", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  server.user = null;
  await userEvent.click(account("Earthdata: a_user"));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(account("Earthdata: not signed in").getAttribute("aria-expanded")).toBeNull();
  expect(messages()).toEqual([["warning", "Your sign-in to Earthdata has ended. Sign in again to continue."]]);
});

test("the keyboard alone opens the menu and the dialog of Sign out, and leaves the menu with the Tab key", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  await userEvent.tab();
  expect(document.activeElement).toBe(account("Earthdata: a_user"));
  await userEvent.keyboard("{Enter}");
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Servers" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sign out" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  await userEvent.tab({ shift: true });
  await userEvent.keyboard(" ");
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await confirmSignOut();
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toHaveLength(1);
});

test("the command Servers of the menu opens the list of the servers of the account and closes the menu", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("button", { name: "Servers" }));
  expect(dockStore.get().tools).toEqual(["servers"]);
  expect(serversViewStore.get()).toEqual({ view: "list", code: null });
  expect(screen.queryByRole("button", { name: "Servers" })).toBeNull();
});

test("signed in without the token, the title bar still shows the account, and the menu says what that means", async () => {
  const server = earthdata("a_user");
  server.token = false;
  sessionStore.set({ state: "signed-in", user: "a_user", token: false });
  render(<Bar />);
  const button = account("Earthdata: a_user");
  await userEvent.click(button);
  const menu = document.getElementById(button.getAttribute("aria-controls") ?? "");
  expect(menu?.textContent).toBe(`Signed in to Earthdata as a_user${TOKEN_WORDS.notHeld}Give the tokenServersSign out`);
  expect(TOKEN_WORDS.notHeld).toBe(
    "The project server does not hold your token now and asks for it when a request to NASA needs it; everything else works without it.",
  );
  // The reading that the menu starts finds the token still gone: the visitor stays signed in, and nothing is reported.
  await vi.waitFor(() => expect(server.sent("GET")).toHaveLength(1));
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user", token: false });
  expect(messages()).toEqual([]);
});

test("the command Give the token opens the pane of the sign-in and closes the menu", async () => {
  const server = earthdata("a_user");
  server.token = false;
  sessionStore.set({ state: "signed-in", user: "a_user", token: false });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("button", { name: "Give the token" }));
  expect(dockStore.get().tools).toEqual(["sign-in"]);
  expect(screen.queryByRole("button", { name: "Give the token" })).toBeNull();
});

test("the menu of a visitor whose token is held offers no command for the token", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  expect(screen.queryByRole("button", { name: "Give the token" })).toBeNull();
});
