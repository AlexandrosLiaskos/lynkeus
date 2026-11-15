// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { Dock } from "../dock/Dock";
import { closeToolPane, dockStore, openToolPane, resetDock } from "../dock/dock";
import { Pane } from "../pane/Pane";
import { resetPanes, setPaneOpen } from "../panes";
import { ToolPane, ToolPaneGroup, type ToolPaneRun } from "./ToolPane";

beforeEach(() => {
  resetDock();
  resetPanes();
  setPaneOpen("catalog", true);
});

/**
 * A tool as a part of the interface declares it: a ribbon button that opens the pane, the parameters, and the
 * state of the run, which the tool sets.
 */
function Buffer({ onRun = vi.fn(), run = null }: { onRun?: () => void; run?: ToolPaneRun | null }) {
  const [distance, setDistance] = useState("100");
  return (
    <>
      <button type="button" onClick={() => openToolPane("buffer")}>
        Buffer
      </button>
      <main tabIndex={0} aria-label="Map" />
      <Dock side="right">
        <Pane id="catalog" title="Catalog">
          Items
        </Pane>
        <ToolPane id="buffer" title="Buffer" runLabel="Compute" onRun={onRun} ready={distance !== ""} run={run}>
          <label className="usa-label" htmlFor="buffer-distance">
            Distance in metres
          </label>
          <input
            className="usa-input"
            id="buffer-distance"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
          />
          <ToolPaneGroup title="Output">
            <label className="usa-label" htmlFor="buffer-name">
              Name of the result
            </label>
            <input className="usa-input" id="buffer-name" defaultValue="Buffer" />
          </ToolPaneGroup>
        </ToolPane>
      </Dock>
    </>
  );
}

const opener = () => screen.getByRole("button", { name: "Buffer" });

test("a tool pane is not drawn before its button opens it", () => {
  render(<Buffer />);
  expect(screen.queryByRole("complementary", { name: "Buffer" })).toBeNull();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
});

test("the button opens the pane in front of the Catalog pane, with a tab for each", async () => {
  render(<Buffer />);
  await userEvent.click(opener());
  const pane = screen.getByRole("complementary", { name: "Buffer" });
  expect(within(pane).getByRole("textbox", { name: "Distance in metres" })).toBeDefined();
  expect(within(pane).getByRole("button", { name: "Compute" })).toBeDefined();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Catalog", "Buffer"]);
  expect(screen.queryByRole("complementary", { name: "Catalog" })).toBeNull();
});

test("the pane is not modal: it is no dialog, and the elements of the page beside it stay in use", async () => {
  render(<Buffer />);
  await userEvent.click(opener());
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(screen.getByRole("main"));
  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(screen.getByRole("complementary", { name: "Buffer" })).toBeDefined();
});

test("the keyboard focus moves to the title of the pane, also when the button is pressed again", async () => {
  render(<Buffer />);
  await userEvent.click(opener());
  const title = screen.getByRole("heading", { name: "Buffer" });
  expect(document.activeElement).toBe(title);
  await userEvent.click(screen.getByRole("tab", { name: "Catalog" }));
  await userEvent.click(opener());
  expect(screen.getByRole("tab", { name: "Buffer" }).getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(title);
});

test("the run button and the Enter key in a field run the tool", async () => {
  const onRun = vi.fn();
  render(<Buffer onRun={onRun} />);
  await userEvent.click(opener());
  await userEvent.click(screen.getByRole("button", { name: "Compute" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Distance in metres" }), "{Enter}");
  expect(onRun).toHaveBeenCalledTimes(2);
});

test("the run button is inactive while the tool lacks what it needs", async () => {
  const onRun = vi.fn();
  render(<Buffer onRun={onRun} />);
  await userEvent.click(opener());
  await userEvent.clear(screen.getByRole("textbox", { name: "Distance in metres" }));
  const run = screen.getByRole("button", { name: "Compute" });
  expect(run.getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(run);
  expect(onRun).not.toHaveBeenCalled();
});

test("a run shows its progress and its Cancel button, and the tool cannot be run again meanwhile", async () => {
  const onRun = vi.fn();
  const onCancel = vi.fn();
  render(
    <ToolPane id="buffer" title="Buffer" onRun={onRun} onCancel={onCancel} run={{ state: "running", progress: 0.4 }}>
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  const bar = screen.getByRole<HTMLProgressElement>("progressbar", { name: "Progress of Buffer" });
  expect(bar.value).toBe(0.4);
  expect(screen.getByRole("status").textContent).toBe("Running (40 %)");
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  expect(onRun).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("a run without a known share shows its own text and no Cancel button when it cannot be stopped", () => {
  render(
    <ToolPane id="buffer" title="Buffer" onRun={vi.fn()} run={{ state: "running", text: "Searching" }}>
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
  expect(screen.getByRole("status").textContent).toBe("Searching");
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
});

test("the outcome of a run is stated at the foot, and a failure is announced as an alert", () => {
  const { rerender } = render(<Buffer run={{ state: "success", text: "The buffer was added to the map." }} />);
  act(() => openToolPane("buffer"));
  expect(screen.getByRole("status").textContent).toBe("The buffer was added to the map.");
  expect(screen.queryByRole("button", { name: "View details" })).toBeNull();
  rerender(<Buffer run={{ state: "error", text: "The server did not answer." }} />);
  expect(screen.getByRole("alert").textContent).toBe("The server did not answer.");
  rerender(<Buffer run={{ state: "warning", text: "The buffer crosses the edge of the layer." }} />);
  expect(screen.getByRole("status").textContent).toBe("The buffer crosses the edge of the layer.");
});

test("the link View details opens the details of the outcome in a dialog", async () => {
  render(<Buffer run={{ state: "success", text: "Finished.", details: <p>It took 3 seconds.</p> }} />);
  act(() => openToolPane("buffer"));
  expect(screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).open).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "View details" }));
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Buffer: details" });
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain("It took 3 seconds.");
});

test("a group of parameters starts closed and opens with a click on its name", async () => {
  render(<Buffer />);
  act(() => openToolPane("buffer"));
  const group = screen.getByRole("group");
  expect(group.hasAttribute("open")).toBe(false);
  await userEvent.click(screen.getByText("Output"));
  expect(group.hasAttribute("open")).toBe(true);
});

test("the close button closes the pane, reports it and returns the keyboard focus to the button that opened it", async () => {
  const onClose = vi.fn();
  render(
    <>
      <button type="button" onClick={() => openToolPane("buffer")}>
        Buffer
      </button>
      <ToolPane id="buffer" title="Buffer" onRun={vi.fn()} onClose={onClose}>
        Parameters
      </ToolPane>
    </>,
  );
  await userEvent.click(opener());
  await userEvent.click(screen.getByRole("button", { name: "Close the Buffer pane" }));
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dockStore.get().tools).toEqual([]);
  expect(document.activeElement).toBe(opener());
});

test("Shift with Escape closes the pane, and the Escape key alone moves the focus to the map", async () => {
  render(<Buffer />);
  await userEvent.click(opener());
  screen.getByRole("textbox", { name: "Distance in metres" }).focus();
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(screen.getByRole("complementary", { name: "Buffer" })).toBeDefined();
  screen.getByRole("textbox", { name: "Distance in metres" }).focus();
  await userEvent.keyboard("{Shift>}{Escape}{/Shift}");
  expect(screen.queryByRole("complementary", { name: "Buffer" })).toBeNull();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
});

test("a tool closes its own pane, and the pane starts again when it is opened the next time", async () => {
  render(<Buffer />);
  await userEvent.click(opener());
  await userEvent.type(screen.getByRole("textbox", { name: "Name of the result", hidden: true }), " of roads");
  act(() => closeToolPane("buffer"));
  expect(screen.queryByRole("complementary", { name: "Buffer" })).toBeNull();
  await userEvent.click(opener());
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name of the result", hidden: true }).value).toBe(
    "Buffer",
  );
});

const BUFFER_INFO = "Draws a zone of one width around each feature of a layer.";

test("the explanation of a tool shows from the button beside its title and describes the pane", () => {
  render(
    <ToolPane id="buffer" title="Buffer" info={BUFFER_INFO} onRun={vi.fn()}>
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  const pane = screen.getByRole("complementary", { name: "Buffer" });
  const info = within(pane).getByRole("button", { name: "Information about Buffer" });
  expect(document.getElementById(pane.getAttribute("aria-describedby") ?? "")?.textContent).toBe(BUFFER_INFO);
  expect(info.getAttribute("aria-describedby")).toBe(pane.getAttribute("aria-describedby"));
  expect(screen.getByRole("heading", { name: "Buffer" }).contains(info)).toBe(false);
});

test("a tool without an explanation has no such button, and its pane has no description", () => {
  render(<Buffer />);
  act(() => openToolPane("buffer"));
  expect(screen.queryByRole("button", { name: "Information about Buffer" })).toBeNull();
  expect(screen.getByRole("complementary", { name: "Buffer" }).hasAttribute("aria-describedby")).toBe(false);
});

test("the Escape key first hides the explanation of a pane, and the second time moves the focus to the map", async () => {
  render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <ToolPane id="buffer" title="Buffer" info={BUFFER_INFO} onRun={vi.fn()}>
        Parameters
      </ToolPane>
    </>,
  );
  act(() => openToolPane("buffer"));
  const info = screen.getByRole("button", { name: "Information about Buffer" });
  // The explanation shows for a focus that the keyboard has brought.
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => info.focus());
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(document.activeElement).toBe(info);
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("main"));
});

test("the foot states what is missing beside the inactive run button, and the button is described by it", async () => {
  function Named() {
    const [name, setName] = useState("");
    return (
      <ToolPane id="buffer" title="Buffer" onRun={vi.fn()} ready={name !== ""} missing="Enter the name of the result.">
        <label className="usa-label" htmlFor="buffer-name">
          Name of the result
        </label>
        <input className="usa-input" id="buffer-name" value={name} onChange={(event) => setName(event.target.value)} />
      </ToolPane>
    );
  }
  render(<Named />);
  act(() => openToolPane("buffer"));
  const run = screen.getByRole("button", { name: "Run" });
  expect(screen.getByRole("status").textContent).toBe("Enter the name of the result.");
  expect(run.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(run.getAttribute("aria-describedby") ?? "")).toBe(screen.getByRole("status"));
  await userEvent.type(screen.getByRole("textbox", { name: "Name of the result" }), "Roads");
  expect(screen.queryByRole("status")).toBeNull();
  expect(run.hasAttribute("aria-disabled")).toBe(false);
  expect(run.hasAttribute("aria-describedby")).toBe(false);
});

test("the sentence on what is missing gives way to the progress of a run", () => {
  render(
    <ToolPane
      id="buffer"
      title="Buffer"
      onRun={vi.fn()}
      ready={false}
      missing="Enter the distance."
      run={{ state: "running" }}
    >
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  expect(screen.getByRole("status").textContent).toBe("Running");
});

test("the outcome of a run offers the link to the next step", async () => {
  const show = vi.fn();
  render(
    <ToolPane
      id="buffer"
      title="Buffer"
      onRun={vi.fn()}
      run={{
        state: "success",
        text: "12 products were found.",
        action: { label: "Show in the Catalog pane", onClick: show },
      }}
    >
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  await userEvent.click(screen.getByRole("button", { name: "Show in the Catalog pane" }));
  expect(show).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toBe("12 products were found.");
});

test("the name of a group of parameters carries the arrow of a section header", () => {
  render(<Buffer />);
  act(() => openToolPane("buffer"));
  const name = screen.getByText("Output");
  expect(name.tagName).toBe("SUMMARY");
  expect(name.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("the secondary command is a link at the left end of the foot, and it does not run the tool", async () => {
  const onRun = vi.fn();
  const restore = vi.fn();
  render(
    <ToolPane id="buffer" title="Buffer" onRun={onRun} secondary={{ label: "Restore defaults", onClick: restore }}>
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  const link = screen.getByRole("button", { name: "Restore defaults" });
  const run = screen.getByRole("button", { name: "Run" });
  expect(link.className).toContain("usa-button--unstyled");
  expect(link.closest(".tool-pane-foot")).not.toBeNull();
  expect(link.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(link.hasAttribute("aria-describedby")).toBe(false);
  expect(screen.queryByRole("button", { name: "Information about Restore defaults" })).toBeNull();
  await userEvent.click(link);
  expect(restore).toHaveBeenCalledTimes(1);
  expect(onRun).not.toHaveBeenCalled();
});

test("the explanation of the secondary command stands behind the button beside it and describes the link", () => {
  render(
    <ToolPane
      id="buffer"
      title="Buffer"
      onRun={vi.fn()}
      ready={false}
      missing="Enter the distance."
      secondary={{ label: "Reset display", onClick: vi.fn(), info: "The layer returns to its first display." }}
    >
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  const link = screen.getByRole("button", { name: "Reset display" });
  const info = screen.getByRole("button", { name: "Information about Reset display" });
  expect(document.getElementById(link.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "The layer returns to its first display.",
  );
  expect(link.contains(info)).toBe(false);
  // The link stands before the sentence on what is missing, and the run button after it.
  const foot = [...(link.closest(".tool-pane-actions")?.children ?? [])];
  expect(foot.map((element) => element.className)).toEqual(["tool-pane-secondary", "tool-pane-missing", "usa-button"]);
});

test("the X of an outcome returns the foot to what it shows before a run and gives the focus to the run button", async () => {
  const onRun = vi.fn();
  const zoom = vi.fn();
  render(
    <Buffer
      onRun={onRun}
      run={{
        state: "success",
        text: "The buffer was added to the map.",
        action: { label: "Zoom to the layer", onClick: zoom },
        details: <p>It took 3 seconds.</p>,
      }}
    />,
  );
  act(() => openToolPane("buffer"));
  const close = screen.getByRole("button", { name: "Close this message" });
  expect(close.closest(".tool-pane-status")).not.toBeNull();
  close.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("button", { name: "Zoom to the layer" })).toBeNull();
  expect(screen.queryByRole("button", { name: "View details" })).toBeNull();
  expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Compute" }));
  expect(onRun).not.toHaveBeenCalled();
  expect(zoom).not.toHaveBeenCalled();
});

test("a closed outcome returns with the next run and when the outcome changes", async () => {
  const onRun = vi.fn();
  const closeOutcome = () => userEvent.click(screen.getByRole("button", { name: "Close this message" }));
  const crosses = "The buffer crosses the edge of the layer.";
  const { rerender } = render(<Buffer onRun={onRun} run={{ state: "success", text: "Finished." }} />);
  act(() => openToolPane("buffer"));
  await closeOutcome();
  expect(screen.queryByRole("status")).toBeNull();
  // The same outcome, drawn again, stays closed.
  rerender(<Buffer onRun={onRun} run={{ state: "success", text: "Finished." }} />);
  expect(screen.queryByRole("status")).toBeNull();
  // Another outcome shows.
  rerender(<Buffer onRun={onRun} run={{ state: "warning", text: crosses }} />);
  expect(screen.getByRole("status").textContent).toBe(crosses);
  await closeOutcome();
  // The next run shows its outcome, also when that outcome states the same.
  await userEvent.click(screen.getByRole("button", { name: "Compute" }));
  expect(onRun).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toBe(crosses);
  await closeOutcome();
  // So does a run that shows its progress first.
  rerender(<Buffer onRun={onRun} run={{ state: "running" }} />);
  rerender(<Buffer onRun={onRun} run={{ state: "warning", text: crosses }} />);
  expect(screen.getByRole("status").textContent).toBe(crosses);
});

test("a run in progress has no X, and neither has the sentence on what the tool lacks", () => {
  const onCancel = vi.fn();
  const { rerender } = render(
    <ToolPane id="buffer" title="Buffer" onRun={vi.fn()} onCancel={onCancel} run={{ state: "running", progress: 0.4 }}>
      Parameters
    </ToolPane>,
  );
  act(() => openToolPane("buffer"));
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Close this message" })).toBeNull();
  rerender(
    <ToolPane id="buffer" title="Buffer" onRun={vi.fn()} ready={false} missing="Enter the distance.">
      Parameters
    </ToolPane>,
  );
  expect(screen.getByRole("status").textContent).toBe("Enter the distance.");
  expect(screen.queryByRole("button", { name: "Close this message" })).toBeNull();
  expect(onCancel).not.toHaveBeenCalled();
});
