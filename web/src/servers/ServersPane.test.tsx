import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { onSignInEnded } from "../data/service";
import { resetSession, sessionStore, signIn, signInEnded } from "../data/session";
import { SignInPane } from "../data/SignInPane";
import { layer, showPage } from "../data/testSession";
import { dockStore, frontOf, resetDock } from "../shared/dock/dock";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { serversStore } from "../shared/servers";
import { tooManyServers, unknownCode, WRONG_FORM } from "./AddServer";
import { loadServers, resetServers } from "./requests";
import { PURPOSE, ServersPane } from "./ServersPane";
import { openAddServer, openServers, resetServersState, returnStore, SERVERS_PANE, serversViewStore } from "./state";
import {
  CHANGE_LIMITS,
  CHANGE_NAME,
  CONFIRMATION,
  LABORATORY,
  NEW,
  OFFICE,
  OFFICE_NAME,
  RELEASE,
  SERVERS,
  site,
  VIEW,
  type Site,
} from "./testServers";

let server: Site;
const SIGNED_IN = { state: "signed-in", user: "a_user" } as const;
const CODE = VIEW.user_code;

beforeEach(() => {
  resetServers();
  resetServersState();
  resetSession();
  resetJobs();
  resetLayers();
  resetDock();
  mapLayersStore.set([]);
  messagesStore.set([]);
  showPage(true);
  window.history.replaceState(null, "", "/");
  onSignInEnded(signInEnded);
  server = site();
  server.servers = [...SERVERS.servers];
  server.pairings = { [CODE]: VIEW };
  sessionStore.set(SIGNED_IN);
});

afterEach(() => {
  resetServers();
  resetJobs();
  onSignInEnded(() => undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Draw the page with the pane of the servers and the pane of the sign-in, as the page holds them, and an
 * element that stands for the map.
 */
function show() {
  return render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <SignInPane />
      <ServersPane />
    </>,
  );
}

/** Draw the page and open the pane on the list of the servers, once the servers are read. */
async function showList() {
  show();
  act(() => openServers());
  await screen.findByText(/One Earthdata account connects at most/);
}

/** The pane of the servers, by its title. It is found only while it is open and in front of its stack. */
const pane = (name = "Servers") => screen.getByRole("complementary", { name });
const isOpen = () => dockStore.get().tools.includes(SERVERS_PANE);
const front = () => frontOf(dockStore.get(), "right");
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);
const elementOf = (name: string): HTMLElement => {
  const item = screen.getByText(name, { selector: ".item-title" }).closest("li");
  if (!item) {
    throw new Error(`The list holds no server ${name}.`);
  }
  return item;
};
const itemOf = (name: string) => within(elementOf(name));
/** The button of the form that is open in the list: the command, or Cancel. */
const formButton = (name: string) => {
  const form = document.querySelector<HTMLElement>(".server-form");
  if (!form) {
    throw new Error("No form of a server is open.");
  }
  return within(form).getByRole("button", { name });
};
const commandOf = (name: string, command: string) =>
  within(screen.getByRole("toolbar", { name: `Commands of the server ${name}` })).getByRole("button", {
    name: command,
  });
const rowsOf = (name: string) =>
  [...elementOf(name).querySelectorAll(".property-row")].map(
    (row) =>
      `${row.querySelector(".property-name")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
const alerts = () => screen.queryAllByRole("alert").map((alert) => alert.textContent);

test("the pane is closed until a command opens it, and then stands beside the map and not over the page", () => {
  show();
  expect(isOpen()).toBe(false);
  expect(screen.queryByRole("complementary")).toBeNull();
  act(() => openServers());
  expect(pane()).toBeDefined();
  expect(isOpen()).toBe(true);
  expect(front()).toBe(SERVERS_PANE);
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Servers" }));
});

test("before the server has answered about the sign-in, the pane says that it is being checked", () => {
  resetSession();
  show();
  act(() => openServers());
  expect(within(pane()).getByRole("status").textContent).toBe("Checking whether you are signed in to Earthdata.");
  expect(server.sent("GET", "/api/servers")).toEqual([]);
});

test("a visitor who is not signed in is told so, with what an own server is for and the way to sign in", async () => {
  sessionStore.set({ state: "signed-out" });
  server.user = null;
  show();
  act(() => openServers());
  expect(within(pane()).getByRole("status").textContent).toBe(
    "You are not signed in to Earthdata, and an own server belongs to an Earthdata account. Sign in first: this pane then shows again.",
  );
  expect(within(pane()).getByText(PURPOSE)).toBeDefined();
  expect(server.sent("GET", "/api/servers")).toEqual([]);
  await userEvent.click(within(pane()).getByRole("button", { name: "Sign in" }));
  // The pane of the sign-in comes to the front of the stack, and the pane of the servers waits behind it.
  expect(dockStore.get().tools).toEqual(["servers", "sign-in"]);
  expect(front()).toBe("sign-in");
  expect(screen.getByRole("complementary", { name: "Sign in to Earthdata" })).toBeDefined();
  expect(screen.queryByRole("complementary", { name: "Servers" })).toBeNull();
});

test("after the sign-in the pane comes to the front again and lists the servers", async () => {
  sessionStore.set({ state: "signed-out" });
  server.user = null;
  show();
  act(() => openServers());
  await userEvent.click(within(pane()).getByRole("button", { name: "Sign in" }));
  expect(front()).toBe("sign-in");
  await act(() => signIn("a token"));
  expect(front()).toBe(SERVERS_PANE);
  expect(pane()).toBeDefined();
  expect(await screen.findByText("Office computer", { selector: ".item-title" })).toBeDefined();
});

test("when the server does not answer about the sign-in, the pane says that the sign-in is not known", () => {
  sessionStore.set({ state: "unreachable" });
  show();
  act(() => openServers());
  expect(within(pane()).getByRole("status").textContent).toBe(
    "The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata. Sign in first: this pane then shows again.",
  );
});

test("without a server the list says what an own server is for and offers to add one", async () => {
  server.servers = [];
  show();
  act(() => openServers());
  expect(await screen.findByText("No own server")).toBeDefined();
  expect(screen.getByText(PURPOSE)).toBeDefined();
  expect(PURPOSE.split(". ")).toHaveLength(3);
  await userEvent.click(screen.getByRole("button", { name: "Add a server" }));
  expect(pane("Add a server")).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Add a server" }));
});

test("the list shows each server with its name, whether it is connected and since when it is not", async () => {
  await showList();
  expect(
    screen.getByText("1 of your 3 servers are connected. One Earthdata account connects at most 8 servers."),
  ).toBeDefined();
  expect(
    [...document.querySelectorAll(".server")].map((item) => item.querySelector(".item-title")?.textContent.trim()),
  ).toEqual(["Office computer", "Laboratory server", "DESKTOP-7Q2LM4K"]);
  expect([...document.querySelectorAll(".server > .item-main > .item-line")].map((line) => line.textContent)).toEqual([
    "Connected",
    "Not connected since 14 Nov 2026, 18:05:40 UTC",
    "Not connected yet",
  ]);
});

test("a server shows its system, processors, memory, disk, jobs and layers", async () => {
  await showList();
  expect(rowsOf("Office computer")).toEqual([
    "System: Windows 11",
    "Lynkeus Server: Version 0.1.0",
    "Processors: 20",
    "Memory: 16 GB",
    "Running: 1 of at most 4",
    "Waiting: 2",
    "Layers kept: 6",
    "Space used by layers: 1.3 GB of at most 100 GB",
    "Largest layer allowed: 10 GB",
    "Free disk space: 412 GB",
    "Connected to your account: 15 Nov 2026, 08:00:00 UTC",
    "Last message: 15 Nov 2026, 09:40:12 UTC",
    "Identifier: 3f9a1c0b7e24d658",
  ]);
});

test("a server whose layers use the space of its limit says so", async () => {
  await showList();
  expect(
    itemOf("Laboratory server").getByText(/^The layers of the server "Laboratory server" use 50 GB/),
  ).toBeDefined();
  expect(itemOf("Office computer").queryByText(/^The layers of the server/)).toBeNull();
});

test("a server that has not reported yet says so, and its limits cannot be set yet", async () => {
  await showList();
  expect(itemOf("DESKTOP-7Q2LM4K").getByText("The server has not reported its state yet.")).toBeDefined();
  const limits = commandOf("DESKTOP-7Q2LM4K", "Set limits");
  expect(limits.getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(limits);
  expect(screen.queryByLabelText("Jobs at the same time")).toBeNull();
});

test("a reading that fails is stated, with the button that reads again", async () => {
  server.refuse("GET", "/api/servers", 502, null);
  show();
  act(() => openServers());
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Your servers could not be read (the server answered 502).");
  server.accept();
  await userEvent.click(screen.getByRole("button", { name: "Read again" }));
  expect(await screen.findByText("Office computer", { selector: ".item-title" })).toBeDefined();
  expect(alerts()).toEqual([]);
});

test("a server is renamed in a field that holds its name", async () => {
  await showList();
  await userEvent.click(commandOf("Office computer", "Rename"));
  const field = screen.getByLabelText<HTMLInputElement>("New name");
  expect(field.value).toBe("Office computer");
  expect(document.activeElement).toBe(field);
  await userEvent.clear(field);
  await userEvent.type(field, `${CHANGE_NAME.name}{Enter}`);
  expect(await screen.findByText("Field laptop", { selector: ".item-title" })).toBeDefined();
  expect(server.sent("PATCH")).toEqual([
    { method: "PATCH", address: `/api/servers/${OFFICE.id}`, content: CHANGE_NAME },
  ]);
  expect(messages()).toEqual([["info", 'The server was renamed to "Field laptop".']]);
  expect(screen.queryByLabelText("New name")).toBeNull();
  expect(document.activeElement).toBe(commandOf("Field laptop", "Rename"));
});

test("a server is not renamed to nothing, and Cancel leaves its name", async () => {
  await showList();
  await userEvent.click(commandOf("Office computer", "Rename"));
  await userEvent.clear(screen.getByLabelText("New name"));
  await userEvent.click(formButton("Rename"));
  expect(alerts()).toEqual(["Enter the new name of the server."]);
  expect(screen.getByLabelText("New name").getAttribute("aria-invalid")).toBe("true");
  await userEvent.click(formButton("Cancel"));
  expect(server.sent("PATCH")).toEqual([]);
  expect(screen.getByText("Office computer", { selector: ".item-title" })).toBeDefined();
});

test("a new name that the server refuses is stated under the field", async () => {
  await showList();
  server.refuse("PATCH", "/api/servers", 422, "The name of a server has 1 to 80 characters.");
  await userEvent.click(commandOf("Office computer", "Rename"));
  await userEvent.type(screen.getByLabelText("New name"), " 2{Enter}");
  expect(await screen.findByText("The name of a server has 1 to 80 characters.")).toBeDefined();
  expect(screen.getByLabelText("New name")).toBeDefined();
});

test("the limits of a server are shown and set in jobs and in gigabytes", async () => {
  await showList();
  await userEvent.click(commandOf("Office computer", "Set limits"));
  const jobs = screen.getByLabelText<HTMLInputElement>("Jobs at the same time");
  const storage = screen.getByLabelText<HTMLInputElement>("Space for layers (GB)");
  const size = screen.getByLabelText<HTMLInputElement>("Largest layer (GB)");
  expect([jobs.value, storage.value, size.value]).toEqual(["4", "100", "10"]);
  for (const [field, value] of [
    [jobs, "2"],
    [storage, "250"],
    [size, "20"],
  ] as const) {
    await userEvent.clear(field);
    await userEvent.type(field, value);
  }
  await userEvent.click(formButton("Set limits"));
  await vi.waitFor(() => expect(server.sent("PATCH")).toHaveLength(1));
  expect(server.sent("PATCH")[0]).toEqual({
    method: "PATCH",
    address: `/api/servers/${OFFICE.id}`,
    content: CHANGE_LIMITS,
  });
  await vi.waitFor(() =>
    expect(messages()).toEqual([["info", 'The new limits were sent to the server "Office computer".']]),
  );
  // The server has not applied the limits yet: the list says so and still shows the limits in force.
  const pending =
    "The server has not applied its new limits yet: 2 jobs at the same time, 250 GB for layers and 20 GB for one layer. The list shows them once the server reports them.";
  expect(itemOf("Office computer").getByText(pending)).toBeDefined();
  expect(rowsOf("Office computer")).toContain("Running: 1 of at most 4");
  await userEvent.click(commandOf("Office computer", "Set limits"));
  expect(screen.getByLabelText<HTMLInputElement>("Jobs at the same time").value).toBe("2");
  await userEvent.click(formButton("Cancel"));
  server.apply(OFFICE.id);
  await act(() => loadServers());
  expect(itemOf("Office computer").queryByText(pending)).toBeNull();
  expect(rowsOf("Office computer")).toContain("Running: 1 of at most 2");
  expect(rowsOf("Office computer")).toContain("Space used by layers: 1.3 GB of at most 250 GB");
  expect(rowsOf("Office computer")).toContain("Largest layer allowed: 20 GB");
});

test("a limit that is no sound number is stated under its field, and nothing is sent", async () => {
  await showList();
  await userEvent.click(commandOf("Office computer", "Set limits"));
  const jobs = screen.getByLabelText("Jobs at the same time");
  await userEvent.clear(jobs);
  await userEvent.type(jobs, "0");
  expect(alerts()).toEqual([]);
  await userEvent.tab();
  expect(alerts()).toEqual(["Enter a whole number of jobs from 1 to 64."]);
  await userEvent.clear(screen.getByLabelText("Largest layer (GB)"));
  await userEvent.click(formButton("Set limits"));
  expect(alerts()).toEqual([
    "Enter a whole number of jobs from 1 to 64.",
    "Enter the size in gigabytes, as a number of zero or more.",
  ]);
  expect(server.sent("PATCH")).toEqual([]);
});

test("limits for a server that is not connected are kept for it, and the visitor is told so", async () => {
  await showList();
  await userEvent.click(commandOf("Laboratory server", "Set limits"));
  const jobs = screen.getByLabelText("Jobs at the same time");
  await userEvent.clear(jobs);
  await userEvent.type(jobs, "6{Enter}");
  await vi.waitFor(() =>
    expect(messages()).toEqual([
      [
        "info",
        'The new limits are kept for the server "Laboratory server", which receives them when it connects again.',
      ],
    ]),
  );
  expect(server.sent("PATCH")[0]?.content).toEqual({
    limits: { running_jobs: 6, storage: 50_000_000_000, layer_size: 5_000_000_000 },
  });
  expect(itemOf("Laboratory server").getByText(/^The server has not applied its new limits yet: 6 jobs/)).toBeDefined();
});

test("limits that the server refuses are stated, and the fields stay", async () => {
  await showList();
  server.refuse("PATCH", "/api/servers", 503, "The server is not connected, so its limits cannot be set now.");
  await userEvent.click(commandOf("Laboratory server", "Set limits"));
  await userEvent.click(formButton("Set limits"));
  expect(await screen.findByText("The server is not connected, so its limits cannot be set now.")).toBeDefined();
  expect(screen.getByLabelText("Jobs at the same time")).toBeDefined();
});

test("the removal of a server says what happens to its layers before it is carried out", async () => {
  await showList();
  await userEvent.click(commandOf("Office computer", "Remove"));
  expect(
    itemOf("Office computer").getByText(
      'The server "Office computer" leaves your account, and Lynkeus Server on that computer forgets the connection. Its jobs leave the list of jobs. The files of its 6 layers stay on that computer, and the layers leave the lists and the map of Lynkeus.',
    ),
  ).toBeDefined();
  expect(server.sent("DELETE")).toEqual([]);
  await userEvent.click(formButton("Cancel"));
  expect(server.sent("DELETE")).toEqual([]);
  expect(rowsOf("Office computer")).toHaveLength(13);
});

test("a removed server leaves the list, and its layers leave the lists and the map", async () => {
  const address = `/api/servers/${OFFICE.id}/files/fedcba9876543210fedcba9876543210/backscatter-hh.tif`;
  const own = layer({ id: "own", url: address, record: address.replace(".tif", ".json") });
  server.layers = [{ layer: own, server: OFFICE_NAME }];
  mapLayersStore.set([own]);
  await showList();
  await userEvent.click(commandOf("Office computer", "Remove"));
  await userEvent.click(formButton("Remove"));
  await vi.waitFor(() => expect(screen.queryByText("Office computer", { selector: ".item-title" })).toBeNull());
  expect(server.sent("DELETE").map(({ address: sent }) => sent)).toEqual([`/api/servers/${OFFICE.id}`]);
  expect(messages()).toEqual([["info", 'The server "Office computer" was removed from your account.']]);
  expect(mapLayersStore.get()).toEqual([]);
  await vi.waitFor(() => expect(server.sent("GET", "/api/layers")).toHaveLength(1));
  expect(layersStore.get()).toEqual([]);
  expect(
    screen.getByText("0 of your 2 servers are connected. One Earthdata account connects at most 8 servers."),
  ).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Servers" }));
});

test("the removal of a server without a report or without a layer is worded for it", async () => {
  await showList();
  await userEvent.click(commandOf("DESKTOP-7Q2LM4K", "Remove"));
  expect(itemOf("DESKTOP-7Q2LM4K").getByText(/The files of its layers stay on that computer/)).toBeDefined();
});

test("an account with the most servers allowed cannot add one, and is told why", async () => {
  server.limit = 3;
  await showList();
  const add = screen.getByRole("button", { name: "Add a server" });
  expect(add.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(add.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Your account has the most servers that it may connect. Remove one to connect another.",
  );
  await userEvent.click(add);
  expect(pane()).toBeDefined();
});

test("the steps name the download, the program and the button, and say plainly when no version is published", async () => {
  await showList();
  await userEvent.click(screen.getByRole("button", { name: "Add a server" }));
  expect(pane("Add a server")).toBeDefined();
  expect([...document.querySelectorAll(".servers-steps > li")].map((step) => step.firstChild?.textContent)).toEqual([
    "Download Lynkeus Server for the system of your computer.",
    "Open Lynkeus Server on that computer. The program shows a code of eight letters and opens this page.",
    "Check that the code here is the one that the program shows, and press Connect here.",
  ]);
  expect(
    await screen.findByText(
      "No version of Lynkeus Server is published yet, so there is nothing to download. The downloads appear here with the first release.",
    ),
  ).toBeDefined();
  expect(screen.queryByRole("list", { name: "Downloads of Lynkeus Server" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Show my servers" }));
  expect(pane("Servers")).toBeDefined();
});

test("the downloads of the latest release are listed for the three systems, each with its address and its size", async () => {
  server.release = { status: 200, content: RELEASE };
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/145.0",
  );
  show();
  act(() => openAddServer());
  const list = await screen.findByRole("list", { name: "Downloads of Lynkeus Server" });
  expect([...list.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
    "Linux: Lynkeus-Server-0.2.0-Linux.tar.gz (81.2 MB, for the system of this computer)",
    "Windows: Lynkeus-Server-0.2.0-Windows.exe (76.5 MB)",
    "macOS: Lynkeus-Server-0.2.0-macOS.dmg (79.9 MB)",
  ]);
  expect(
    within(list)
      .getAllByRole<HTMLAnchorElement>("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual([
    "https://github.com/AlexandrosLiaskos/lynkeus/releases/download/v0.2.0/Lynkeus-Server-0.2.0-Linux.tar.gz",
    "https://github.com/AlexandrosLiaskos/lynkeus/releases/download/v0.2.0/Lynkeus-Server-0.2.0-Windows.exe",
    "https://github.com/AlexandrosLiaskos/lynkeus/releases/download/v0.2.0/Lynkeus-Server-0.2.0-macOS.dmg",
  ]);
  expect(screen.getByText("Version v0.2.0, published 20 Nov 2026, 10:00:00 UTC.")).toBeDefined();
});

test("when GitHub gives no answer, the steps say so and lead to the page of the releases", async () => {
  server.release = null;
  show();
  act(() => openAddServer());
  const link = await screen.findByRole<HTMLAnchorElement>("link", { name: "the releases of Lynkeus on GitHub" });
  expect(link.getAttribute("href")).toBe("https://github.com/AlexandrosLiaskos/lynkeus/releases");
  expect(link.target).toBe("_blank");
  expect(link.closest("[role=status]")?.textContent).toBe(
    "The list of the downloads could not be read from GitHub. Open the releases of Lynkeus on GitHub (opens in a new tab).",
  );
});

test("a release without a file of Lynkeus Server says so", async () => {
  server.release = { status: 200, content: { ...RELEASE, assets: [] } };
  show();
  act(() => openAddServer());
  expect(
    await screen.findByText("The latest release of Lynkeus, v0.2.0, holds no file of Lynkeus Server."),
  ).toBeDefined();
});

test("an address with a code opens the pane on the code and the computer that asked, and Connect confirms", async () => {
  window.history.replaceState(null, "", `/?connect=${CODE}#map=7/42.8/-71`);
  server.servers = [OFFICE];
  show();
  expect(pane("Add a server")).toBeDefined();
  expect(await screen.findByText("DESKTOP-7Q2LM4K")).toBeDefined();
  expect(server.sent("GET", "/api/servers/pairings/").map(({ address }) => address)).toContain(
    `/api/servers/pairings/${CODE}`,
  );
  expect([...pane("Add a server").querySelectorAll(".property-row")].map((row) => row.textContent)).toEqual([
    "CodeWDJB-MJHT",
    "Name of the computerDESKTOP-7Q2LM4K",
    "SystemWindows 11",
    "Lynkeus ServerVersion 0.1.0",
  ]);
  expect(
    screen.getByText(
      "Press Connect only when Lynkeus Server on your computer shows the code WDJB-MJHT. The computer then runs jobs and keeps layers for the Earthdata account a_user.",
    ),
  ).toBeDefined();
  expect(server.sent("POST")).toEqual([]);
  expect(window.location.search).toBe(`?connect=${CODE}`);
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  await vi.waitFor(() => expect(pane("Servers")).toBeDefined());
  expect(server.sent("POST")).toEqual([{ method: "POST", address: "/api/servers", content: CONFIRMATION }]);
  expect(messages()).toEqual([
    ["success", 'The computer "DESKTOP-7Q2LM4K" is connected as a server of your Earthdata account.'],
  ]);
  expect(await screen.findByText("DESKTOP-7Q2LM4K", { selector: ".item-title" })).toBeDefined();
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("#map=7/42.8/-71");
});

test("an address with the word alone opens the pane on the steps, with a field for the code", async () => {
  window.history.replaceState(null, "", "/?connect");
  show();
  expect(pane("Add a server")).toBeDefined();
  const field = screen.getByLabelText<HTMLInputElement>("Code");
  expect(field.value).toBe("");
  expect(server.sent("GET", "/api/servers/pairings/")).toEqual([]);
  await userEvent.type(field, "wdjb mjht{Enter}");
  expect(await screen.findByText("DESKTOP-7Q2LM4K")).toBeDefined();
  expect(server.sent("GET", "/api/servers/pairings/").map(({ address }) => address)).toEqual([
    `/api/servers/pairings/${CODE}`,
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Enter another code" }));
  expect(screen.getByLabelText<HTMLInputElement>("Code").value).toBe("");
});

test("a text that is no code is not sent, and the field says what a code is", async () => {
  window.history.replaceState(null, "", "/?connect=abc");
  show();
  expect(screen.getByLabelText<HTMLInputElement>("Code").value).toBe("ABC");
  expect(alerts()).toEqual([WRONG_FORM]);
  await userEvent.click(screen.getByRole("button", { name: "Find the computer" }));
  expect(alerts()).toEqual([WRONG_FORM]);
  expect(server.sent("GET", "/api/servers/pairings/")).toEqual([]);
});

test("an unknown code is stated in one sentence, and the field keeps it for a correction", async () => {
  window.history.replaceState(null, "", "/?connect=BCDF-GHJK");
  show();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(unknownCode("BCDF-GHJK"));
  expect(alert.textContent).toBe(
    "The code BCDF-GHJK is unknown or no longer valid. A code is valid for 15 minutes: enter the code that Lynkeus Server shows at present.",
  );
  const field = screen.getByLabelText<HTMLInputElement>("Code");
  expect(field.value).toBe("BCDF-GHJK");
  expect(field.getAttribute("aria-describedby")).toContain(alert.id);
  await userEvent.clear(field);
  await userEvent.type(field, `${CODE}{Enter}`);
  expect(await screen.findByText("DESKTOP-7Q2LM4K")).toBeDefined();
  expect(alerts()).toEqual([]);
});

test("a code that is no longer valid when Connect is pressed returns to the field", async () => {
  window.history.replaceState(null, "", `/?connect=${CODE}`);
  show();
  await screen.findByText("DESKTOP-7Q2LM4K");
  server.pairings = {};
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect((await screen.findByRole("alert")).textContent).toBe(unknownCode(CODE));
  expect(screen.getByLabelText<HTMLInputElement>("Code").value).toBe(CODE);
});

test("an account with the most servers allowed is told so when it confirms a pairing", async () => {
  window.history.replaceState(null, "", `/?connect=${CODE}`);
  server.limit = 3;
  show();
  await screen.findByText("DESKTOP-7Q2LM4K");
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect((await screen.findByRole("alert")).textContent).toBe(tooManyServers(3));
  expect(tooManyServers(3)).toBe(
    "Your Earthdata account has 3 servers, the most that one account may connect. Remove a server in the list of your servers to connect this computer.",
  );
  expect(screen.getByRole("button", { name: "Connect" }).getAttribute("aria-disabled")).toBeNull();
  expect(window.location.search).toBe(`?connect=${CODE}`);
});

test("a visitor who is not signed in signs in first and returns to the same code", async () => {
  window.history.replaceState(null, "", `/?connect=${CODE}`);
  sessionStore.set({ state: "signed-out" });
  server.user = null;
  server.servers = [];
  show();
  expect(within(pane("Add a server")).getByRole("status").textContent).toBe(
    "You are not signed in to Earthdata, and an own server belongs to an Earthdata account. Sign in first: this pane then shows again with the code WDJB-MJHT.",
  );
  expect(server.sent("GET", "/api/servers")).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(dockStore.get().tools).toEqual(["servers", "sign-in"]);
  expect(front()).toBe("sign-in");
  expect(returnStore.get()).toBe(true);
  expect(serversViewStore.get()).toEqual({ view: "add", code: CODE });
  expect(window.location.search).toBe(`?connect=${CODE}`);
  await act(() => signIn("a token"));
  expect(front()).toBe(SERVERS_PANE);
  expect(pane("Add a server")).toBeDefined();
  expect(await screen.findByText("DESKTOP-7Q2LM4K")).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  await vi.waitFor(() => expect(server.sent("POST", "/api/servers")).toHaveLength(1));
  await vi.waitFor(() => expect(window.location.search).toBe(""));
});

test("a sign-in that ends while the code is confirmed keeps the code for the return", async () => {
  show();
  act(() => openAddServer());
  await userEvent.type(screen.getByLabelText("Code"), `${CODE}{Enter}`);
  await screen.findByText("DESKTOP-7Q2LM4K");
  server.user = null;
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  await vi.waitFor(() => expect(sessionStore.get()).toEqual({ state: "signed-out" }));
  expect(within(pane("Add a server")).getAllByRole("status")[0]?.textContent).toMatch(
    /this pane then shows again with the code WDJB-MJHT\.$/,
  );
  expect(serversViewStore.get().code).toBe(CODE);
});

test("closing the pane takes the word out of the address", async () => {
  window.history.replaceState(null, "", `/?connect=${CODE}`);
  show();
  await screen.findByText("DESKTOP-7Q2LM4K");
  await userEvent.click(screen.getByRole("button", { name: "Close the Add a server pane" }));
  expect(isOpen()).toBe(false);
  expect(window.location.search).toBe("");
  expect(server.sent("POST")).toEqual([]);
});

test("the servers are read again when the pane opens", async () => {
  show();
  await vi.waitFor(() => expect(serversStore.get()).toEqual(SERVERS));
  server.servers = [LABORATORY, NEW];
  act(() => openServers());
  await vi.waitFor(() => expect(screen.queryByText("Office computer", { selector: ".item-title" })).toBeNull());
  expect(screen.getByText("Laboratory server", { selector: ".item-title" })).toBeDefined();
});
