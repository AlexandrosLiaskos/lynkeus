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

// The tests of the keyboard use a first tab with two groups of buttons.
const TWO_GROUPS: readonly RibbonTab[] = TABS.map((tab) =>
  tab.id === "first"
    ? {
        ...tab,
        groups: [
          ...tab.groups,
          {
            label: "More",
            tools: [
              { id: "extra", label: "Extra", icon: "add", description: "Does more work." },
              { id: "last", label: "Last", icon: "flag", description: "Does the last work." },
            ],
          },
        ],
      }
    : tab,
);

/** Return the element that has the keyboard focus, as its role and its name. */
function focused(): string {
  const element = document.activeElement;
  const name = element?.getAttribute("aria-label") ?? element?.textContent ?? "";
  return `${element?.getAttribute("role") ?? element?.tagName.toLowerCase() ?? ""} ${name}`;
}

test("the buttons of a tab form a toolbar that carries the name of the tab", () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  const toolbar = screen.getByRole("toolbar", { name: "First" });
  expect(within(toolbar).getAllByRole("button")).toHaveLength(4);
});

test("the Home and End keys move to the first and the last tab and show its groups", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  await userEvent.tab();
  await userEvent.keyboard("{End}");
  expect(focused()).toBe("tab Second");
  expect(screen.getByRole("group", { name: "Other" })).toBeDefined();
  await userEvent.keyboard("{Home}");
  expect(focused()).toBe("tab First");
  expect(screen.getByRole("group", { name: "Group" })).toBeDefined();
});

test("the Tab key stops once on the tabs and once on the buttons", async () => {
  render(
    <>
      <Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />
      <button type="button">After</button>
    </>,
  );
  const stops: string[] = [];
  for (const shift of [false, false, false, true, true]) {
    await userEvent.tab({ shift });
    stops.push(focused());
  }
  expect(stops).toEqual(["tab First", "button Ready", "button After", "button Ready", "tab First"]);
});

test("the arrow keys, Home and End move between the buttons, across the groups", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.tab();
  const stops: string[] = [];
  for (const key of ["{ArrowRight}", "{ArrowRight}", "{End}", "{ArrowRight}", "{ArrowLeft}", "{Home}"]) {
    await userEvent.keyboard(key);
    stops.push(focused());
  }
  expect(stops).toEqual(["button Later", "button Extra", "button Last", "button Ready", "button Last", "button Ready"]);
});

test("the Control key with an arrow key moves to the first button of the group beside", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}{Control>}{ArrowRight}{/Control}");
  expect(focused()).toBe("button Extra");
  await userEvent.keyboard("{ArrowRight}{Control>}{ArrowLeft}{/Control}");
  expect(focused()).toBe("button Ready");
});

test("an unfinished button takes the focus from an arrow key and shows its description", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");
  const later = screen.getByRole("button", { name: "Later" });
  expect(document.activeElement).toBe(later);
  expect(later.getAttribute("aria-disabled")).toBe("true");
  const tip = document.getElementById(later.getAttribute("aria-describedby") ?? "")?.parentElement;
  expect(tip?.hidden).toBe(false);
  expect(tip?.textContent).toBe("LaterWill do its work. Not yet available.");
});

test("the down arrow key moves from a tab to the buttons, and the up arrow key back to the tab", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  expect(focused()).toBe("button Ready");
  await userEvent.keyboard("{ArrowRight}{ArrowUp}");
  expect(focused()).toBe("tab First");
});

test("the Tab key returns to the button that last had the focus", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  await userEvent.tab({ shift: true });
  expect(focused()).toBe("tab First");
  await userEvent.tab();
  expect(focused()).toBe("button Extra");
});

test("the Tab key stops first on the first finished button, or on the first button when none is finished", async () => {
  const { unmount } = render(<Ribbon tabs={TWO_GROUPS} actions={{ extra: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.tab();
  expect(focused()).toBe("button Extra");
  unmount();
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  await userEvent.tab();
  await userEvent.tab();
  expect(focused()).toBe("button Ready");
});
