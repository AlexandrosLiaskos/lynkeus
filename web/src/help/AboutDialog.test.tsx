// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { version } from "../../package.json";
import { ABOUT } from "./about";
import { AboutDialog } from "./AboutDialog";
import { aboutDialogStore } from "./state";

function open() {
  render(<AboutDialog />);
  act(() => aboutDialogStore.set(true));
  return screen.getByRole<HTMLDialogElement>("dialog", { name: "About Lynkeus" });
}

/** The names and the values of a list of names and values, row by row. */
function rows(list: Element | null | undefined): (string | null | undefined)[][] {
  return Array.from(list?.querySelectorAll(".property-row") ?? [], (row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector(".property-value-text")?.textContent,
  ]);
}

/** The section of the dialog that carries a name. */
function section(dialog: HTMLElement, name: string): HTMLElement {
  const found = within(dialog).getByRole("heading", { level: 3, name }).closest<HTMLElement>(".section");
  if (!found) {
    throw new Error(`The dialog has no section ${name}.`);
  }
  return found;
}

beforeEach(() => {
  aboutDialogStore.set(false);
});

test("the dialog starts closed and opens with its name as its heading", () => {
  render(<AboutDialog />);
  expect(screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).open).toBe(false);
  act(() => aboutDialogStore.set(true));
  expect(screen.getByRole<HTMLDialogElement>("dialog", { name: "About Lynkeus" }).open).toBe(true);
  expect(screen.getByRole("heading", { level: 2, name: "About Lynkeus" })).toBeDefined();
});

test("the dialog states what Lynkeus is and that it is independent of NASA, and shows no image", () => {
  const dialog = open();
  expect(within(dialog).getByText(ABOUT.purpose)).toBeDefined();
  expect(within(dialog).getByText(ABOUT.independence)).toBeDefined();
  expect(dialog.querySelector("img")).toBeNull();
});

test("the dialog shows the version of package.json, the team and the team log as names and values", () => {
  const dialog = open();
  expect(rows(dialog.querySelector(".property-list"))).toEqual([
    ["Version", version],
    ["Developed by", "Team Lynkeus"],
    ["Team log", "https://lynkeus.nkua.cloud/team-log/"],
  ]);
});

test("the first section states the licence as NOTICE gives it, with the links to the source code, LICENSE and NOTICE", () => {
  const dialog = open();
  const licence = section(dialog, "Licence");
  expect(dialog.querySelector(".section")).toBe(licence);
  expect(within(licence).getByRole("button", { name: "Licence" }).getAttribute("aria-expanded")).toBe("true");
  const info = within(licence).getByRole("button", { name: "Information about Licence" });
  expect(document.getElementById(info.getAttribute("aria-describedby") ?? "")?.textContent).toBe(ABOUT.terms);
  expect(Array.from(licence.querySelectorAll(".about-licence > p"), (paragraph) => paragraph.textContent)).toEqual([
    "Copyright 2026 Alexandros Liaskos",
    ABOUT.licence,
    ABOUT.warranty,
  ]);
  expect(within(licence).getByRole("heading", { level: 4, name: "Attribution" })).toBeDefined();
  expect(Array.from(licence.querySelectorAll(".about-attribution > p"), (line) => line.textContent)).toEqual([
    "Lynkeus, by Alexandros Liaskos and Team Lynkeus.",
    "Liaskos, A., and Team Lynkeus (2026). Lynkeus: a web platform for the analysis of surface change with radar data of the NISAR mission [software]. https://github.com/AlexandrosLiaskos/lynkeus",
  ]);
  expect(rows(licence)).toEqual([
    ["Source code", "https://github.com/AlexandrosLiaskos/lynkeus"],
    ["Licence", "https://github.com/AlexandrosLiaskos/lynkeus/blob/main/LICENSE"],
    ["Notice", "https://github.com/AlexandrosLiaskos/lynkeus/blob/main/NOTICE"],
  ]);
  const links = within(dialog).getAllByRole<HTMLAnchorElement>("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href"), link.target])).toEqual(
    [
      "https://lynkeus.nkua.cloud/team-log/",
      "https://github.com/AlexandrosLiaskos/lynkeus",
      "https://github.com/AlexandrosLiaskos/lynkeus/blob/main/LICENSE",
      "https://github.com/AlexandrosLiaskos/lynkeus/blob/main/NOTICE",
    ].map((address) => [address, address, "_blank"]),
  );
});

test("the citation entry stands in a section of its own, with its explanation behind the i", () => {
  const dialog = open();
  const citation = section(dialog, "Citation");
  expect(within(citation).getByRole("button", { name: "Citation" }).getAttribute("aria-expanded")).toBe("true");
  const info = within(citation).getByRole("button", { name: "Information about Citation" });
  expect(document.getElementById(info.getAttribute("aria-describedby") ?? "")?.textContent).toBe(ABOUT.cite);
  expect(rows(citation)).toEqual([
    ["Title", "Lynkeus"],
    ["Authors", "Alexandros Liaskos and Team Lynkeus"],
    ["Version", version],
    ["Address", "https://lynkeus.nkua.cloud/"],
    ["Repository", "https://github.com/AlexandrosLiaskos/lynkeus"],
    ["Licence", "AGPL-3.0-only"],
  ]);
  expect(
    within(citation)
      .getAllByRole("button", { name: /^Copy / })
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Copy Address", "Copy Repository"]);
});

test("no explanation stands as text under a heading of the dialog", () => {
  const dialog = open();
  expect(within(dialog).queryByText(ABOUT.cite, { selector: "p" })).toBeNull();
  expect(within(dialog).queryByText(ABOUT.terms, { selector: "p" })).toBeNull();
  expect(dialog.querySelector(".usa-hint")).toBeNull();
});

test("the dialog states what is stored about a visitor, in a section that starts closed", async () => {
  const dialog = open();
  const stored = section(dialog, "Stored data");
  const toggle = within(stored).getByRole("button", { name: "Stored data" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(Array.from(stored.querySelectorAll("li"), (item) => item.textContent)).toEqual([
    ABOUT.applicationStores,
    `${ABOUT.sessionStarts} ${ABOUT.session} ${ABOUT.sessionEnds}`,
    ABOUT.teamLogStores,
    ABOUT.serverStores,
  ]);
  expect(stored.querySelector("ul")?.closest("[hidden]")).not.toBeNull();
  await userEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(stored.querySelector("ul")?.closest("[hidden]")).toBeNull();
});

test("the close button closes the dialog", async () => {
  open();
  await userEvent.click(screen.getByRole("button", { name: "Close this window" }));
  expect(aboutDialogStore.get()).toBe(false);
});
