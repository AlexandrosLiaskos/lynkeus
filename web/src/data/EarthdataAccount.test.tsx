import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dockStore, resetDock } from "../shared/dock/dock";
import { messagesStore } from "../shared/messages/messages";
import { resetServersState, serversDialogStore } from "../servers/state";
import { EarthdataAccount } from "./EarthdataAccount";
import { resetSession, sessionStore } from "./session";
import { earthdata } from "./testSignIn";

/** The title bar with the account, and an element after it that can take the keyboard focus. */
function Bar() {
  return (
    <>
      <header>
        <EarthdataAccount />
      </header>
      <main tabIndex={0} aria-label="Map" />
    </>
  );
}

const account = (name: string) => screen.getByRole("button", { name });

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
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(<Bar />);
  const button = account("Earthdata: a_user");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  await userEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  const menu = document.getElementById(button.getAttribute("aria-controls") ?? "");
  expect(menu?.textContent).toBe("Signed in to Earthdata as a_userServersSign out");
  expect(dockStore.get().tools).toEqual([]);
  // The opening of the menu asks the server whether the sign-in still stands.
  expect(server.sent("GET")).toHaveLength(1);
  await userEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("the command Sign out of the menu signs out, closes the menu and leaves the focus on the button", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toHaveLength(1);
  expect(messages()).toEqual([["success", "You are signed out of Earthdata. Jobs that were already started go on."]]);
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(document.activeElement).toBe(account("Earthdata: not signed in"));
});

test("the Escape key closes the menu and returns the focus to the button", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  screen.getByRole("button", { name: "Sign out" }).focus();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(document.activeElement).toBe(account("Earthdata: a_user"));
});

test("a press outside the menu closes it", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("main"));
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("the menu closes when the sign-in ends", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(<Bar />);
  server.user = null;
  await userEvent.click(account("Earthdata: a_user"));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(account("Earthdata: not signed in").getAttribute("aria-expanded")).toBeNull();
  expect(messages()).toEqual([["warning", "Your sign-in to Earthdata has ended. Sign in again to continue."]]);
});

test("the keyboard alone opens the menu, signs out, and leaves the menu with the Tab key", async () => {
  const server = earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
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
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toHaveLength(1);
  expect(document.activeElement).toBe(account("Earthdata: not signed in"));
});

test("the command Servers of the menu opens the list of the servers of the account and closes the menu", async () => {
  earthdata("a_user");
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(<Bar />);
  await userEvent.click(account("Earthdata: a_user"));
  await userEvent.click(screen.getByRole("button", { name: "Servers" }));
  expect(serversDialogStore.get()).toEqual({ open: true, view: "list", code: null });
  expect(screen.queryByRole("button", { name: "Servers" })).toBeNull();
});
