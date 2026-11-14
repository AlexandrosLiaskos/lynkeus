import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { HOVER_DELAY } from "../shared/tooltip/Tooltip";
import { Ribbon } from "./Ribbon";
import type { RibbonTab } from "./types";

const TABS: readonly RibbonTab[] = [
  {
    id: "first",
    label: "First",
    groups: [
      {
        label: "Group",
        tools: [
          { id: "ready", label: "Ready", icon: "check", description: "Does its work." },
          { id: "later", label: "Later", icon: "schedule", description: "Will do its work." },
        ],
      },
    ],
  },
  {
    id: "second",
    label: "Second",
    groups: [{ label: "Other", tools: [{ id: "other", label: "Other tool", icon: "info", description: "Informs." }] }],
  },
];

afterEach(() => {
  vi.useRealTimers();
});

test("the first tab is selected and shows its groups", () => {
  render(<Ribbon tabs={TABS} actions={{}} />);
  expect(screen.getByRole("tab", { name: "First" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("group", { name: "Group" })).toBeDefined();
  expect(screen.queryByRole("group", { name: "Other" })).toBeNull();
});

test("a click on a tab, or an arrow key, shows the groups of that tab", async () => {
  render(<Ribbon tabs={TABS} actions={{}} />);
  await userEvent.click(screen.getByRole("tab", { name: "Second" }));
  expect(screen.getByRole("group", { name: "Other" })).toBeDefined();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "First" }).getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "First" }));
});

test("a finished button runs its action, and an unfinished one is inactive", async () => {
  const run = vi.fn();
  render(<Ribbon tabs={TABS} actions={{ ready: { run } }} />);
  const ready = screen.getByRole("button", { name: "Ready" });
  const later = screen.getByRole("button", { name: "Later" });
  expect(ready.getAttribute("aria-disabled")).toBeNull();
  expect(later.getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(ready);
  await userEvent.click(later);
  expect(run).toHaveBeenCalledTimes(1);
});

test("a button that stays switched on is marked as pressed", () => {
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn(), pressed: true } }} />);
  expect(screen.getByRole("button", { name: "Ready" }).getAttribute("aria-pressed")).toBe("true");
});

test("every button is described by its sentence, and an unfinished one also by the reason", () => {
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn() } }} />);
  const describe = (name: string) =>
    document.getElementById(screen.getByRole("button", { name }).getAttribute("aria-describedby") ?? "")?.textContent;
  expect(describe("Ready")).toBe("Does its work.");
  expect(describe("Later")).toBe("Will do its work. Not yet available.");
});

test("the description shows on keyboard focus and hides on the Escape key", async () => {
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn() } }} />);
  const group = screen.getByRole("group", { name: "Group" });
  const [tip] = within(group).getAllByRole("tooltip", { hidden: true });
  expect(tip?.hidden).toBe(true);
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ready" }));
  expect(tip?.hidden).toBe(false);
  expect(tip?.textContent).toBe("ReadyDoes its work.");
  await userEvent.keyboard("{Escape}");
  expect(tip?.hidden).toBe(true);
});

test("the description shows after the pointer rests on a button and hides when it leaves", () => {
  vi.useFakeTimers();
  render(<Ribbon tabs={TABS} actions={{}} />);
  const later = screen.getByRole("button", { name: "Later" });
  const tip = document.getElementById(later.getAttribute("aria-describedby") ?? "")?.parentElement;
  fireEvent.pointerEnter(later);
  expect(tip?.hidden).toBe(true);
  act(() => {
    vi.advanceTimersByTime(HOVER_DELAY);
  });
  expect(tip?.hidden).toBe(false);
  fireEvent.pointerLeave(later);
  expect(tip?.hidden).toBe(true);
});

test("the Escape key hides a description that the pointer opened, without keyboard focus on its button", () => {
  vi.useFakeTimers();
  render(<Ribbon tabs={TABS} actions={{}} />);
  const later = screen.getByRole("button", { name: "Later" });
  const tip = document.getElementById(later.getAttribute("aria-describedby") ?? "")?.parentElement;
  fireEvent.pointerEnter(later);
  act(() => {
    vi.advanceTimersByTime(HOVER_DELAY);
  });
  expect(document.activeElement).toBe(document.body);
  expect(tip?.hidden).toBe(false);
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(tip?.hidden).toBe(true);
});

test("the description shows under the panel of the ribbon, with a clear strip from the button to it", async () => {
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn() } }} />);
  const ready = screen.getByRole("button", { name: "Ready" });
  vi.spyOn(ready, "getBoundingClientRect").mockReturnValue({ left: 10, bottom: 100 } as DOMRect);
  vi.spyOn(screen.getByRole("tabpanel"), "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
  await userEvent.tab();
  await userEvent.tab();
  const tip = document.getElementById(ready.getAttribute("aria-describedby") ?? "")?.parentElement;
  expect(tip?.hidden).toBe(false);
  expect(tip?.style.left).toBe("10px");
  expect(tip?.style.top).toBe("100px");
  expect(tip?.style.borderTopWidth).toBe("24px");
});
