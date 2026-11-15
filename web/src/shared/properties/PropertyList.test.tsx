// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { copyText } from "../clipboard";
import { messagesStore } from "../messages/messages";
import { COPIED_TIME, PropertyList, stableKeys, type PropertyGroup } from "./PropertyList";

vi.mock("../clipboard", () => ({ copyText: vi.fn() }));

const ID = "NISAR_L2_PR_GCOV_010_141_A_071_4005_DHDH_A_20261021T012345_20261021T012420_X05009_N_F_J_001";

const GROUPS: PropertyGroup[] = [
  {
    title: "Orbit",
    rows: [
      { name: "Track", value: 141 },
      { name: "Direction", value: "Ascending" },
    ],
  },
  {
    rows: [
      { name: "Identifier", value: ID, copy: true, info: "The field GranuleUR of the record." },
      { name: "Size", value: <strong>1.2 GB</strong>, copy: "1288490189" },
    ],
  },
];

beforeEach(() => {
  vi.mocked(copyText).mockReset().mockResolvedValue(undefined);
  messagesStore.set([]);
});

afterEach(() => {
  vi.useRealTimers();
});

test("the properties are a description list of names and values, in groups under their headings", () => {
  render(<PropertyList groups={GROUPS} />);
  expect(screen.getByRole("heading", { level: 4, name: "Orbit" })).toBeDefined();
  expect(screen.getAllByRole("heading")).toHaveLength(1);
  const names = screen.getAllByRole("term").map((term) => term.firstElementChild?.textContent);
  expect(names).toEqual(["Track", "Direction", "Identifier", "Size"]);
  const values = screen.getAllByRole("definition").map((value) => value.firstElementChild?.textContent);
  expect(values).toEqual(["141", "Ascending", ID, "1.2 GB"]);
});

test("a row has a copy button only when it asks for one, and the button is named after the property", () => {
  render(<PropertyList groups={GROUPS} />);
  expect(
    screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((name) => name?.startsWith("Copy")),
  ).toEqual(["Copy Identifier", "Copy Size"]);
});

test("the copy button copies the value as it is shown, or the text that the row gives for it", async () => {
  render(<PropertyList groups={GROUPS} />);
  await userEvent.click(screen.getByRole("button", { name: "Copy Identifier" }));
  expect(copyText).toHaveBeenLastCalledWith(ID);
  await userEvent.click(screen.getByRole("button", { name: "Copy Size" }));
  expect(copyText).toHaveBeenLastCalledWith("1288490189");
});

test("the row states that its value was copied, for two seconds", async () => {
  vi.useFakeTimers();
  render(<PropertyList groups={GROUPS} />);
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy Identifier" }));
  // The copy ends in the next turn of the page.
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole("status").textContent).toBe("Copied");
  expect(screen.getAllByRole("definition")[2]?.contains(screen.getByRole("status"))).toBe(true);
  act(() => {
    vi.advanceTimersByTime(COPIED_TIME);
  });
  expect(screen.queryByRole("status")).toBeNull();
});

test("a copy that the browser refuses is reported as an error", async () => {
  vi.mocked(copyText).mockRejectedValue(new Error("Not allowed"));
  render(<PropertyList groups={GROUPS} />);
  await userEvent.click(screen.getByRole("button", { name: "Copy Identifier" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["error", "The browser did not allow the copy. Select the value and copy it with the keyboard."],
  ]);
});

test("the explanation of a property stands behind the button beside its name", () => {
  render(<PropertyList groups={GROUPS} />);
  const info = screen.getByRole("button", { name: "Information about Identifier" });
  expect(document.getElementById(info.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "The field GranuleUR of the record.",
  );
  expect(screen.queryByRole("button", { name: "Information about Track" })).toBeNull();
});

test("an element is known by its id or, without one, by its name and its position among equals", () => {
  const keys = stableKeys([
    { name: "Coherence" },
    { name: "Backscatter" },
    { name: "Coherence" },
    { id: "b", name: "Coherence" },
  ]);
  expect(new Set(keys).size).toBe(4);
  // An element that enters before the others leaves their keys as they are.
  expect(stableKeys([{ name: "File" }, { name: "Coherence" }, { name: "Backscatter" }]).slice(1)).toEqual(
    keys.slice(0, 2),
  );
  expect(stableKeys([{ id: "b", name: "Other title" }])).toEqual(keys.slice(3));
});

test("a group that enters before the others leaves their rows in place, with the mark of a copy", async () => {
  const { rerender } = render(<PropertyList groups={GROUPS} />);
  await userEvent.click(screen.getByRole("button", { name: "Copy Identifier" }));
  const button = screen.getByRole("button", { name: "Copy Identifier" });
  const mark = await screen.findByRole("status");
  rerender(<PropertyList groups={[{ title: "File", rows: [{ name: "Format", value: "GeoTIFF" }] }, ...GROUPS]} />);
  expect(screen.getByRole("button", { name: "Copy Identifier" })).toBe(button);
  expect(screen.getByRole("status")).toBe(mark);
  expect(button.closest("dd")?.contains(mark)).toBe(true);
  // A row that enters before the others of its group leaves them in place as well.
  const [orbit, record] = GROUPS;
  rerender(
    <PropertyList
      groups={[orbit ?? { rows: [] }, { rows: [{ name: "Version", value: "1.0" }, ...(record?.rows ?? [])] }]}
    />,
  );
  expect(screen.getByRole("button", { name: "Copy Identifier" })).toBe(button);
  expect(screen.getByRole("status")).toBe(mark);
});

test("two groups of one title are both listed, and each copies and marks its own row", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const layer = (value: string): PropertyGroup => ({
    title: "Coherence",
    rows: [{ name: "Value", value, copy: true }],
  });
  render(<PropertyList groups={[layer("0.5"), layer("0.7")]} />);
  expect(screen.getAllByRole("heading", { name: "Coherence" })).toHaveLength(2);
  const [, second] = screen.getAllByRole("button", { name: "Copy Value" });
  await userEvent.click(second ?? document.body);
  expect(copyText).toHaveBeenLastCalledWith("0.7");
  expect(await screen.findAllByRole("status")).toHaveLength(1);
  expect(second?.closest("dd")?.contains(screen.getByRole("status"))).toBe(true);
  // React reports two children of one key as an error.
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test("groups and rows with an id keep their elements when their order changes", () => {
  const first: PropertyGroup = {
    id: "a",
    title: "Coherence",
    rows: [{ id: "x", name: "Value", value: "0.5", copy: true }],
  };
  const second: PropertyGroup = {
    id: "b",
    title: "Coherence",
    rows: [{ id: "x", name: "Value", value: "0.7", copy: true }],
  };
  const { rerender } = render(<PropertyList groups={[first, second]} />);
  const buttons = screen.getAllByRole("button", { name: "Copy Value" });
  rerender(<PropertyList groups={[second, first]} />);
  const moved = screen.getAllByRole("button", { name: "Copy Value" });
  expect(moved[0]).toBe(buttons[1]);
  expect(moved[1]).toBe(buttons[0]);
  expect(screen.getAllByRole("definition").map((value) => value.firstElementChild?.textContent)).toEqual([
    "0.7",
    "0.5",
  ]);
});
