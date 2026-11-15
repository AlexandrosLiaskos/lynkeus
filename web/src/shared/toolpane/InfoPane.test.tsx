// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { Dock } from "../dock/Dock";
import { dockStore, openToolPane, resetDock } from "../dock/dock";
import { Pane } from "../pane/Pane";
import { resetPanes, setPaneOpen } from "../panes";
import { InfoPane } from "./InfoPane";

beforeEach(() => {
  resetDock();
  resetPanes();
  setPaneOpen("catalog", true);
});

/** A pane to read, beside the Catalog pane, with the ribbon button that opens it. */
function Steps({ onClose }: { onClose?: () => void }) {
  return (
    <>
      <button type="button" onClick={() => openToolPane("steps")}>
        Getting started
      </button>
      <main tabIndex={0} aria-label="Map" />
      <Dock side="right">
        <Pane id="catalog" title="Catalog">
          Items
        </Pane>
        <InfoPane id="steps" title="Getting started" info="The steps of the work, in order." onClose={onClose}>
          <p>Sign in to Earthdata</p>
        </InfoPane>
      </Dock>
    </>
  );
}

const opener = () => screen.getByRole("button", { name: "Getting started" });

test("the pane is not drawn before its button opens it", () => {
  render(<Steps />);
  expect(screen.queryByRole("complementary", { name: "Getting started" })).toBeNull();
  expect(screen.queryByText("Sign in to Earthdata")).toBeNull();
});

test("the button opens the pane in the stack of the tool panes, with the focus on its title", async () => {
  render(<Steps />);
  await userEvent.click(opener());
  const pane = screen.getByRole("complementary", { name: "Getting started" });
  expect(pane.textContent).toContain("Sign in to Earthdata");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Catalog", "Getting started"]);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Getting started" }));
});

test("the pane has the body of a pane and no form, no run button and no foot", () => {
  render(<Steps />);
  act(() => openToolPane("steps"));
  const pane = screen.getByRole("complementary", { name: "Getting started" });
  expect(pane.querySelector(".pane-body")?.textContent).toBe("Sign in to Earthdata");
  expect(pane.querySelector("form")).toBeNull();
  expect(pane.querySelector(".tool-pane-foot")).toBeNull();
  expect(
    within(pane)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual([
    "Information about Getting started",
    "Auto-hide the Getting started pane",
    "Close the Getting started pane",
  ]);
});

test("the explanation of the pane stands behind the button beside its title and describes the pane", () => {
  render(<Steps />);
  act(() => openToolPane("steps"));
  const pane = screen.getByRole("complementary", { name: "Getting started" });
  expect(document.getElementById(pane.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "The steps of the work, in order.",
  );
});

test("the close button closes the pane, reports it and returns the focus to the button that opened it", async () => {
  const onClose = vi.fn();
  render(<Steps onClose={onClose} />);
  await userEvent.click(opener());
  await userEvent.click(screen.getByRole("button", { name: "Close the Getting started pane" }));
  expect(screen.queryByRole("complementary", { name: "Getting started" })).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dockStore.get().tools).toEqual([]);
  expect(document.activeElement).toBe(opener());
});

test("Shift with Escape closes the pane, and the Escape key alone moves the focus to the map", async () => {
  render(<Steps />);
  await userEvent.click(opener());
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(screen.getByRole("complementary", { name: "Getting started" })).toBeDefined();
  act(() => screen.getByRole("heading", { name: "Getting started" }).focus());
  await userEvent.keyboard("{Shift>}{Escape}{/Shift}");
  expect(screen.queryByRole("complementary", { name: "Getting started" })).toBeNull();
});
