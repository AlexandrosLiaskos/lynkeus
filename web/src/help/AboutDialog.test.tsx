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

/** The fact that stands beside a name in a list of facts. */
function fact(list: HTMLElement, name: string): string | null | undefined {
  return within(list).getByText(name, { selector: "dt" }).nextElementSibling?.textContent;
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

test("the dialog shows the version of package.json, the team, the licence and the two links", () => {
  const dialog = open();
  const [facts] = within(dialog)
    .getAllByRole("definition")
    .map((cell) => cell.parentElement);
  if (!facts) {
    throw new Error("The dialog has no list of facts.");
  }
  expect(fact(facts, "Version")).toBe(version);
  expect(fact(facts, "Developed by")).toBe("Team Lynkeus");
  expect(fact(facts, "Licence")).toBe(
    "Copyright 2026 Alexandros Liaskos. This product is licensed under the Apache License, Version 2.0.",
  );
  const links = within(dialog).getAllByRole<HTMLAnchorElement>("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["https://lynkeus.nkua.cloud/team-log/", "https://lynkeus.nkua.cloud/team-log/"],
    ["https://github.com/AlexandrosLiaskos/lynkeus", "https://github.com/AlexandrosLiaskos/lynkeus"],
  ]);
});

test("the dialog shows the citation entry under its own heading", () => {
  const dialog = open();
  const heading = within(dialog).getByRole("heading", { level: 3, name: "Citation" });
  expect(heading.nextElementSibling?.textContent).toBe(ABOUT.cite);
  const entry = heading.nextElementSibling?.nextElementSibling;
  expect(Array.from(entry?.children ?? [], (cell) => cell.textContent)).toEqual([
    "Title",
    "Lynkeus",
    "Author",
    "Alexandros Liaskos",
    "Version",
    version,
    "Address",
    "https://lynkeus.nkua.cloud/",
    "Repository",
    "https://github.com/AlexandrosLiaskos/lynkeus",
    "Licence",
    "Apache-2.0",
  ]);
});

test("the dialog states what is stored about a visitor", () => {
  const dialog = open();
  const heading = within(dialog).getByRole("heading", { level: 3, name: "What Lynkeus stores about a visitor" });
  expect(Array.from(heading.nextElementSibling?.children ?? [], (item) => item.textContent)).toEqual([
    ABOUT.applicationStores,
    `${ABOUT.sessionStarts} ${ABOUT.session} ${ABOUT.sessionEnds}`,
    ABOUT.teamLogStores,
    ABOUT.serverStores,
  ]);
});

test("the close button closes the dialog", async () => {
  open();
  await userEvent.click(screen.getByRole("button", { name: "Close this window" }));
  expect(aboutDialogStore.get()).toBe(false);
});
