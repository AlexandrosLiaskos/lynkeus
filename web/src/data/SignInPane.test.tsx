import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Dock } from "../shared/dock/Dock";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { messagesStore } from "../shared/messages/messages";
import { resetSession, sessionStore } from "./session";
import { ABOUT, IDLE_MINUTES, LONGEST_HOURS, SIGN_IN_PANE, SignInPane, TOKEN_PAGE } from "./SignInPane";
import { earthdata, REFUSAL, TOKEN, type Earthdata } from "./testSignIn";

/** The page around the pane: a button that opens it, the map, and the right side of the map. */
function Page() {
  return (
    <>
      <button type="button" onClick={() => openToolPane(SIGN_IN_PANE)}>
        Open the pane
      </button>
      <main tabIndex={0} aria-label="Map" />
      <Dock side="right">
        <SignInPane />
      </Dock>
    </>
  );
}

/** Draw the page, wait for the answer of the server about the session, and open the pane. */
async function open(server: Earthdata): Promise<void> {
  render(<Page />);
  await vi.waitFor(() => expect(sessionStore.get().state).not.toBe("unknown"));
  expect(server.sent("GET")).toHaveLength(1);
  await userEvent.click(opener());
}

const opener = () => screen.getByRole("button", { name: "Open the pane" });
const pane = () => screen.queryByRole("complementary", { name: "Sign in to Earthdata" });
const field = () => screen.getByLabelText<HTMLInputElement>("User token");
const status = () => pane()?.querySelector('[role="status"]')?.textContent ?? null;

/** Return the explanation behind the "i" beside the title of the pane. */
const about = () => document.getElementById(pane()?.getAttribute("aria-describedby") ?? "")?.textContent;

/** The button at the foot of the pane, which signs in, signs out or asks the server again. */
function run(): HTMLButtonElement {
  const button = pane()?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) {
    throw new Error("The pane is closed.");
  }
  return button;
}

function messages(): [string, string][] {
  return messagesStore.get().map(({ kind, text }) => [kind, text]);
}

/** Read a time in seconds from the file of the server that sets when a sign-in ends. */
function seconds(name: string): number {
  const sessions = readFileSync(resolve(import.meta.dirname, "../../../api/src/lynkeus/sessions.py"), "utf8");
  const written = new RegExp(`^${name} = ([0-9.* ]+)$`, "m").exec(sessions)?.[1] ?? "";
  return written.split("*").reduce((product, factor) => product * Number(factor), 1);
}

beforeEach(() => {
  resetSession();
  resetDock();
  messagesStore.set([]);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the page asks the server for the session when it loads, and the pane is closed", async () => {
  const server = earthdata();
  render(<Page />);
  expect(pane()).toBeNull();
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.received).toEqual([{ method: "GET", address: "/api/session", content: undefined }]);
});

test("before the server has answered, the pane says that it is checking and its button is inactive", async () => {
  const server = earthdata();
  server.slow = true;
  render(<Page />);
  await userEvent.click(opener());
  expect(status()).toBe("Checking whether you are signed in to Earthdata.");
  expect(pane()?.querySelector(".notice--info")).not.toBeNull();
  expect(run().textContent).toBe("Sign in");
  expect(run().getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(run().getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Wait for the answer of the server.",
  );
  expect(screen.queryByLabelText("User token")).toBeNull();
  act(() => server.release());
  expect(await screen.findByLabelText("User token")).toBeTruthy();
});

test("the form gives the three steps of a sign-in, and says what a token is and what the server does with it", async () => {
  await open(earthdata());
  expect(screen.getAllByRole("listitem").map((step) => step.textContent)).toEqual([
    "Open the page Generate Token of Earthdata Login (opens in a new tab).",
    "Press Generate Token and then Show Token on that page, and copy the token.",
    "Paste the token into the field below and press Sign in.",
  ]);
  const link = screen.getByRole<HTMLAnchorElement>("link", { name: "Generate Token of Earthdata Login" });
  expect(link.href).toBe(TOKEN_PAGE);
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
  expect(about()).toBe(ABOUT.tool);
  expect(about()).toMatch(/for 60 days/);
  // Every explanation stands behind an "i", and the pane has one filled button.
  expect(screen.getByRole("button", { name: "Information about User token" })).toBeDefined();
  expect(document.querySelector(".usa-hint")).toBeNull();
  expect(pane()?.querySelectorAll(".usa-button:not(.usa-button--outline, .usa-button--unstyled)")).toHaveLength(1);
  const use = document.getElementById(field().getAttribute("aria-describedby") ?? "");
  expect(use?.textContent).toBe(
    "The server of Lynkeus checks the signature and the expiry date of the token and keeps the token in its memory only, to request data from NASA in your name. It forgets the token when you sign out, after 30 minutes without use and after 8 hours. Lynkeus keeps no copy of the token in the browser.",
  );
});

test("the two times that the form states are those of the server", () => {
  expect(seconds("EARTHDATA_IDLE_TIME")).toBe(IDLE_MINUTES * 60);
  expect(seconds("EARTHDATA_TIME")).toBe(LONGEST_HOURS * 3600);
});

test("the field hides the token, accepts a pasted one and is named for a password manager", async () => {
  await open(earthdata());
  expect(field().type).toBe("password");
  expect(field().autocomplete).toBe("current-password");
  expect(field().required).toBe(true);
  expect(field().getAttribute("spellcheck")).toBe("false");
  field().focus();
  await userEvent.paste(TOKEN);
  expect(field().value).toBe(TOKEN);
});

test("the button Show token shows the characters and hides them again", async () => {
  await open(earthdata());
  const show = screen.getByRole("button", { name: "Show token" });
  expect(show.getAttribute("aria-controls")).toBe(field().id);
  await userEvent.type(field(), "abc");
  await userEvent.click(show);
  expect(field().type).toBe("text");
  expect(field().value).toBe("abc");
  await userEvent.click(screen.getByRole("button", { name: "Hide token" }));
  expect(field().type).toBe("password");
});

test("a sign-in sends the token, empties the field, names the user in a message and closes the pane", async () => {
  const server = earthdata();
  await open(server);
  await userEvent.type(field(), ` ${TOKEN} `);
  await userEvent.click(screen.getByRole("button", { name: "Show token" }));
  server.slow = true;
  await userEvent.click(run());

  // The request is on its way: the field is empty and hidden again, and the check is announced.
  expect(server.sent("POST")).toEqual([
    { method: "POST", address: "/api/session/earthdata", content: { token: TOKEN } },
  ]);
  expect(field().value).toBe("");
  expect(field().type).toBe("password");
  expect(field().readOnly).toBe(true);
  expect(status()).toBe("Checking the token");
  expect(run().getAttribute("aria-disabled")).toBe("true");

  // A second press during the check sends nothing.
  await userEvent.click(run());
  expect(server.sent("POST")).toHaveLength(1);

  act(() => server.release());
  await vi.waitFor(() => expect(pane()).toBeNull());
  expect(messages()).toEqual([["success", "You are signed in to Earthdata as a_user."]]);
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user" });
  expect(document.activeElement).toBe(opener());
});

test("after a sign-in the token is kept nowhere on the page", async () => {
  const consoles = (["log", "info", "warn", "error", "debug"] as const).map((name) =>
    vi.spyOn(console, name).mockImplementation(() => undefined),
  );
  const server = earthdata();
  const address = window.location.href;
  await open(server);
  field().focus();
  await userEvent.paste(TOKEN);
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(sessionStore.get().state).toBe("signed-in"));
  await userEvent.click(opener());

  // The token left the page once, in the content of one request to the address of the sign-in.
  const requests = server.fetch.mock.calls.filter(([, request]) => JSON.stringify(request).includes(TOKEN));
  expect(requests).toHaveLength(1);
  expect(requests[0]?.[0]).toBe("/api/session/earthdata");
  expect(JSON.stringify(requests[0]?.[1]?.headers)).not.toContain(TOKEN);

  const places = {
    localStorage: JSON.stringify(Object.entries(localStorage)),
    sessionStorage: JSON.stringify(Object.entries(sessionStorage)),
    cookie: document.cookie,
    address: window.location.href,
    history: JSON.stringify(window.history.state),
    session: JSON.stringify(sessionStore.get()),
    messages: JSON.stringify(messagesStore.get()),
    dock: JSON.stringify(dockStore.get()),
    page: document.documentElement.outerHTML,
    fields: [...document.querySelectorAll("input")].map((input) => input.value).join(),
    console: JSON.stringify(consoles.flatMap((spy) => spy.mock.calls)),
  };
  for (const [place, content] of Object.entries(places)) {
    expect(content, place).not.toContain(TOKEN);
  }
  expect(window.location.href).toBe(address);
});

test("a token that is refused is reported at the field in the words of the server, and is not kept", async () => {
  const server = earthdata();
  server.refusal.POST = { status: 401, content: { detail: REFUSAL } };
  await open(server);
  await userEvent.type(field(), TOKEN);
  await userEvent.click(run());

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(REFUSAL);
  // The refusal is a notice under the field, and it describes the field.
  expect(alert.closest(".notice--error")).not.toBeNull();
  expect(field().getAttribute("aria-invalid")).toBe("true");
  expect(field().getAttribute("aria-describedby")?.split(" ")).toContain(alert.closest("[id]")?.id);
  expect(document.activeElement).toBe(field());
  expect(field().value).toBe("");
  expect(field().readOnly).toBe(false);
  expect(status()).toBeNull();
  expect(run().getAttribute("aria-disabled")).toBeNull();
  expect(document.documentElement.outerHTML).not.toContain(TOKEN);
  expect(messages()).toEqual([]);
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(pane()).not.toBeNull();
});

test("the refusal leaves when the next token is sent, and when the pane is closed", async () => {
  const server = earthdata();
  server.refusal.POST = { status: 401, content: { detail: REFUSAL } };
  await open(server);
  await userEvent.type(field(), "first");
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("alert");
  server.slow = true;
  await userEvent.type(field(), "second");
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(field().getAttribute("aria-invalid")).toBeNull();
  act(() => server.release());
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Close the Sign in to Earthdata pane" }));
  await userEvent.click(opener());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a server that does not answer is reported at the field", async () => {
  const server = earthdata();
  await open(server);
  server.down = true;
  await userEvent.type(field(), TOKEN);
  await userEvent.click(run());
  expect((await screen.findByRole("alert")).textContent).toBe(
    "The server of Lynkeus did not answer. Check the connection and try again.",
  );
});

test("an answer of the wrong shape is not taken for a sign-in", async () => {
  const server = earthdata();
  server.refusal.POST = { status: 200, content: { earthdata: null } };
  await open(server);
  await userEvent.type(field(), TOKEN);
  await userEvent.click(run());
  expect((await screen.findByRole("alert")).textContent).toBe("The answer of the server could not be read.");
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
});

test("an empty field is named and nothing is sent", async () => {
  const server = earthdata();
  await open(server);
  await userEvent.type(field(), "   ");
  await userEvent.click(run());
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toBe("Paste your user token into this field.");
  expect(field().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  expect(document.activeElement).toBe(field());
  expect(server.sent("POST")).toEqual([]);
});

test("a refusal that arrives after the pane was closed is shown as a message", async () => {
  const server = earthdata();
  server.refusal.POST = { status: 401, content: { detail: REFUSAL } };
  await open(server);
  await userEvent.type(field(), TOKEN);
  server.slow = true;
  await userEvent.click(run());
  await userEvent.click(screen.getByRole("button", { name: "Close the Sign in to Earthdata pane" }));
  act(() => server.release());
  await vi.waitFor(() => expect(messages()).toEqual([["error", REFUSAL]]));
  await userEvent.click(opener());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the keyboard alone opens the pane, reaches its elements in order, signs in and returns to the button", async () => {
  const server = earthdata();
  render(<Page />);
  await vi.waitFor(() => expect(sessionStore.get().state).toBe("signed-out"));
  await userEvent.tab();
  expect(document.activeElement).toBe(opener());
  await userEvent.keyboard("{Enter}");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Sign in to Earthdata" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Information about Sign in to Earthdata" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Auto-hide the Sign in to Earthdata pane" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close the Sign in to Earthdata pane" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("link", { name: "Generate Token of Earthdata Login" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Information about User token" }));
  await userEvent.tab();
  expect(document.activeElement).toBe(field());
  await userEvent.keyboard(TOKEN);
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show token" }));
  await userEvent.keyboard(" ");
  expect(field().type).toBe("text");
  await userEvent.tab();
  expect(document.activeElement).toBe(run());
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(pane()).toBeNull());
  expect(server.sent("POST")[0]?.content).toEqual({ token: TOKEN });
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user" });
  expect(document.activeElement).toBe(opener());
});

test("a visitor who is signed in sees the user name and can sign out", async () => {
  const server = earthdata("a_user");
  await open(server);
  expect(screen.queryByLabelText("User token")).toBeNull();
  expect(status()).toBe(
    "You are signed in to Earthdata as a_user. The sign-in ends when you sign out, after 30 minutes without use and after 8 hours.",
  );
  expect(pane()?.querySelector(".notice--success")).not.toBeNull();
  expect(about()).toBe(
    "The server of Lynkeus requests data from NASA with the token of this account. A job that was already started goes on after the sign-in ends. To use another account, sign out first.",
  );
  expect(run().textContent).toBe("Sign out");
  await userEvent.click(run());
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("DELETE")).toEqual([{ method: "DELETE", address: "/api/session/earthdata", content: undefined }]);
  expect(messages()).toEqual([["success", "You are signed out of Earthdata. Jobs that were already started go on."]]);
  expect(await screen.findByLabelText("User token")).toBeTruthy();
  expect(run().textContent).toBe("Sign in");
});

test("a sign-out that fails keeps the visitor signed in and reports the words of the server", async () => {
  const server = earthdata("a_user");
  server.refusal.DELETE = { status: 500, content: { detail: "The sign-out could not be recorded." } };
  await open(server);
  await userEvent.click(run());
  await vi.waitFor(() => expect(messages()).toEqual([["error", "The sign-out could not be recorded."]]));
  await vi.waitFor(() => expect(run().getAttribute("aria-disabled")).toBeNull());
  expect(sessionStore.get().state).toBe("signed-in");
});

test("when the service cannot be reached the pane says so and offers to try again", async () => {
  const server = earthdata();
  server.down = true;
  await open(server);
  expect(sessionStore.get()).toEqual({ state: "unreachable" });
  expect(screen.getByRole("alert").textContent).toBe(
    "The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata. Check the connection and try again.",
  );
  expect(pane()?.querySelector(".notice--error")).not.toBeNull();
  expect(screen.queryByLabelText("User token")).toBeNull();
  server.down = false;
  expect(run().textContent).toBe("Try again");
  await userEvent.click(run());
  expect(await screen.findByLabelText("User token")).toBeTruthy();
  expect(server.sent("GET")).toHaveLength(2);
});

test("the page asks again when the visitor returns to it, and reports a sign-in that has ended", async () => {
  const server = earthdata("a_user");
  await open(server);
  server.user = null;
  const show = (state: string) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  act(() => show("hidden"));
  expect(server.sent("GET")).toHaveLength(1);
  act(() => show("visible"));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(server.sent("GET")).toHaveLength(2);
  expect(messages()).toEqual([["warning", "Your sign-in to Earthdata has ended. Sign in again to continue."]]);
  expect(await screen.findByLabelText("User token")).toBeTruthy();
});
