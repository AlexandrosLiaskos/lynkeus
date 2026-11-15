// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { restPointerOn, takePointerOff } from "../shared/tooltip/pointer";
import { NOT_YET_AVAILABLE, reasonOf, Ribbon } from "./Ribbon";
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

test("the reason of an inactive button is that it is not finished, or what a finished button still needs", () => {
  expect(reasonOf(undefined)).toBe(NOT_YET_AVAILABLE);
  expect(reasonOf({ run: vi.fn() })).toBeUndefined();
  expect(reasonOf({ run: vi.fn(), missing: "Select a layer." })).toBe("Select a layer.");
});

test("a finished button that lacks something is inactive, says what it lacks and does not run", async () => {
  const run = vi.fn();
  render(<Ribbon tabs={TABS} actions={{ ready: { run, missing: "Select a layer in the Contents pane." } }} />);
  const ready = screen.getByRole("button", { name: "Ready" });
  expect(ready.getAttribute("aria-disabled")).toBe("true");
  const sentences = document.getElementById(ready.getAttribute("aria-describedby") ?? "");
  expect(sentences?.textContent).toBe("Does its work. Select a layer in the Contents pane.");
  await userEvent.click(ready);
  expect(run).not.toHaveBeenCalled();
});

test("the description of every button reads its name first and then its sentence", () => {
  vi.useFakeTimers();
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn() } }} />);
  const tips = ["Ready", "Later", "Collapse the ribbon"].map((name) => {
    const button = screen.getByRole("button", { name });
    restPointerOn(button);
    const tip = screen.getByRole("tooltip");
    const read = [tip.firstElementChild?.tagName, tip.textContent];
    takePointerOff(button);
    return read;
  });
  expect(tips).toEqual([
    ["STRONG", "ReadyDoes its work."],
    ["STRONG", "LaterWill do its work. Not yet available."],
    [
      "STRONG",
      "Collapse the ribbon (Ctrl+F1)Hides the groups of buttons and leaves the row of tabs, as a double click on a tab does.",
    ],
  ]);
});

test("the description shows on keyboard focus and hides on the Escape key", async () => {
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn() } }} />);
  expect(screen.queryByRole("tooltip")).toBeNull();
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ready" }));
  expect(screen.getByRole("tooltip").textContent).toBe("ReadyDoes its work.");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the description shows after the pointer rests on a button and hides when it leaves", () => {
  vi.useFakeTimers();
  render(<Ribbon tabs={TABS} actions={{}} />);
  const later = screen.getByRole("button", { name: "Later" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  restPointerOn(later);
  expect(screen.getByRole("tooltip").textContent).toBe("LaterWill do its work. Not yet available.");
  takePointerOff(later);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the Escape key hides a description that the pointer opened, without keyboard focus on its button", () => {
  vi.useFakeTimers();
  render(<Ribbon tabs={TABS} actions={{}} />);
  const later = screen.getByRole("button", { name: "Later" });
  restPointerOn(later);
  expect(document.activeElement).toBe(document.body);
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the description shows under the panel of the ribbon, 4 pixels from it", () => {
  vi.useFakeTimers();
  render(<Ribbon tabs={TABS} actions={{ ready: { run: vi.fn() } }} />);
  // The page of the test gives every element the place 0, so the button ends at 0. The panel ends 20 pixels lower.
  vi.spyOn(screen.getByRole("tabpanel"), "getBoundingClientRect").mockReturnValue({ bottom: 20 } as DOMRect);
  restPointerOn(screen.getByRole("button", { name: "Ready" }));
  expect(screen.getByRole("tooltip").style.top).toBe("24px");
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

test("the Tab key stops once on the tabs, once on the buttons and once on the button that collapses the ribbon", async () => {
  render(
    <>
      <Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />
      <button type="button">After</button>
    </>,
  );
  const stops: string[] = [];
  for (const shift of [false, false, false, false, true, true, true]) {
    await userEvent.tab({ shift });
    stops.push(focused());
  }
  expect(stops).toEqual([
    "tab First",
    "button Ready",
    "button Collapse the ribbon",
    "button After",
    "button Collapse the ribbon",
    "button Ready",
    "tab First",
  ]);
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

test("a double click on a tab hides the groups and leaves the row of tabs, and a second one shows them again", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  const first = screen.getByRole("tab", { name: "First" });
  const second = screen.getByRole("tab", { name: "Second" });
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(second.getAttribute("aria-expanded")).toBeNull();
  await userEvent.dblClick(first);
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(screen.queryByRole("group", { name: "Group" })).toBeNull();
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(first.getAttribute("aria-expanded")).toBe("false");
  await userEvent.dblClick(second);
  expect(screen.getByRole("group", { name: "Other" })).toBeDefined();
  expect(second.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("button", { name: "Collapse the ribbon" }).getAttribute("aria-pressed")).toBe("false");
});

test("Control+F1 collapses and expands the ribbon from any part of the page, and a dialog keeps the key", async () => {
  render(
    <>
      <Ribbon tabs={TWO_GROUPS} actions={{}} />
      <button type="button">After</button>
      <dialog open>
        <button type="button">Inside</button>
      </dialog>
    </>,
  );
  screen.getByRole("button", { name: "After" }).focus();
  await userEvent.keyboard("{Control>}{F1}{/Control}");
  expect(screen.queryByRole("toolbar")).toBeNull();
  await userEvent.keyboard("{F1}");
  expect(screen.queryByRole("toolbar")).toBeNull();
  await userEvent.keyboard("{Control>}{F1}{/Control}");
  expect(screen.getByRole("toolbar")).toBeDefined();
  screen.getByRole("button", { name: "Inside" }).focus();
  await userEvent.keyboard("{Control>}{F1}{/Control}");
  expect(screen.getByRole("toolbar")).toBeDefined();
});

test("the button that collapses the ribbon works with the keyboard and stays pressed while the ribbon is collapsed", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  const collapse = screen.getByRole("button", { name: "Collapse the ribbon" });
  expect(collapse.getAttribute("aria-pressed")).toBe("false");
  expect(collapse.getAttribute("aria-keyshortcuts")).toBe("Control+F1");
  expect(document.getElementById(collapse.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Hides the groups of buttons and leaves the row of tabs, as a double click on a tab does.",
  );
  collapse.focus();
  await userEvent.keyboard("{Enter}");
  expect(collapse.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("toolbar")).toBeNull();
  await userEvent.keyboard(" ");
  expect(collapse.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("toolbar")).toBeDefined();
});

test("the focus passes to the selected tab when Control+F1 hides the button that has it", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  await userEvent.tab();
  await userEvent.tab();
  expect(focused()).toBe("button Ready");
  await userEvent.keyboard("{Control>}{F1}{/Control}");
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(focused()).toBe("tab First");
  await userEvent.tab();
  expect(focused()).toBe("button Collapse the ribbon");
});

test("on a collapsed ribbon a click on a tab shows its groups until a button has run", async () => {
  const run = vi.fn();
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run } }} />);
  const collapse = screen.getByRole("button", { name: "Collapse the ribbon" });
  const first = screen.getByRole("tab", { name: "First" });
  await userEvent.click(collapse);
  await userEvent.click(first);
  expect(screen.getByRole("group", { name: "Group" })).toBeDefined();
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(collapse.getAttribute("aria-pressed")).toBe("true");
  // A button that is not finished runs nothing, so the groups stay.
  await userEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(screen.getByRole("group", { name: "Group" })).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Ready" }));
  expect(run).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(first.getAttribute("aria-expanded")).toBe("false");
  expect(focused()).toBe("tab First");
});

test("the groups that a collapsed ribbon shows hide on a second click on the tab and on the Escape key", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  await userEvent.click(screen.getByRole("button", { name: "Collapse the ribbon" }));
  const second = screen.getByRole("tab", { name: "Second" });
  await userEvent.click(second);
  expect(screen.getByRole("group", { name: "Other" })).toBeDefined();
  await userEvent.click(second);
  expect(screen.queryByRole("toolbar")).toBeNull();
  await userEvent.click(second);
  await userEvent.click(screen.getByRole("tab", { name: "First" }));
  expect(screen.getByRole("group", { name: "Group" })).toBeDefined();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("toolbar")).toBeNull();
});

test("the groups that a collapsed ribbon shows hide when the pointer or the focus goes to another part of the page", async () => {
  render(
    <>
      <Ribbon tabs={TWO_GROUPS} actions={{}} />
      <button type="button">After</button>
      <p>Text</p>
    </>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Collapse the ribbon" }));
  const first = screen.getByRole("tab", { name: "First" });
  await userEvent.click(first);
  expect(screen.getByRole("toolbar")).toBeDefined();
  // A press on the name of a group, inside the ribbon, leaves the groups shown.
  fireEvent.pointerDown(screen.getByText("More"));
  expect(screen.getByRole("toolbar")).toBeDefined();
  fireEvent.pointerDown(screen.getByText("Text"));
  expect(screen.queryByRole("toolbar")).toBeNull();
  await userEvent.click(first);
  const stops: string[] = [];
  for (let press = 0; press < 3; press += 1) {
    await userEvent.tab();
    stops.push(`${focused()}, ${screen.queryByRole("toolbar") ? "shown" : "hidden"}`);
  }
  expect(stops).toEqual(["button Ready, shown", "button Collapse the ribbon, shown", "button After, hidden"]);
});

test("on a collapsed ribbon the down arrow key shows the groups and moves the focus to the buttons", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{}} />);
  await userEvent.keyboard("{Control>}{F1}{/Control}");
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");
  expect(focused()).toBe("tab Second");
  expect(screen.queryByRole("toolbar")).toBeNull();
  await userEvent.keyboard("{ArrowLeft}{ArrowDown}");
  expect(focused()).toBe("button Ready");
  expect(screen.getByRole("group", { name: "Group" })).toBeDefined();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(focused()).toBe("tab First");
});

test("the description of a button that an arrow key reaches shows under the panel of the ribbon", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  const later = screen.getByRole("button", { name: "Later" });
  vi.spyOn(later, "getBoundingClientRect").mockReturnValue({ left: 60, bottom: 100 } as DOMRect);
  vi.spyOn(screen.getByRole("tabpanel"), "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");
  const tip = document.getElementById(later.getAttribute("aria-describedby") ?? "")?.parentElement;
  expect(tip?.hidden).toBe(false);
  expect(tip?.style.left).toBe("60px");
  expect(tip?.style.top).toBe("100px");
  expect(tip?.style.borderTopWidth).toBe("24px");
});

test("the description shows under the groups that a collapsed ribbon shows for a while", async () => {
  render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  vi.spyOn(screen.getByRole("tabpanel"), "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
  await userEvent.keyboard("{Control>}{F1}{/Control}");
  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  const ready = screen.getByRole("button", { name: "Ready" });
  expect(document.activeElement).toBe(ready);
  const tip = document.getElementById(ready.getAttribute("aria-describedby") ?? "")?.parentElement;
  expect(tip?.hidden).toBe(false);
  // The simulated browser gives the button a bottom edge of 0, so the clear strip is 120 pixels and the gap of 4.
  expect(tip?.style.borderTopWidth).toBe("124px");
});

test("the description of the button that collapses the ribbon shows under the whole ribbon", async () => {
  const { container } = render(<Ribbon tabs={TWO_GROUPS} actions={{ ready: { run: vi.fn() } }} />);
  const collapse = screen.getByRole("button", { name: "Collapse the ribbon" });
  vi.spyOn(collapse, "getBoundingClientRect").mockReturnValue({ left: 10, bottom: 28 } as DOMRect);
  const ribbon = container.firstElementChild;
  expect(ribbon?.className).toBe("ribbon");
  if (ribbon) {
    vi.spyOn(ribbon, "getBoundingClientRect").mockReturnValue({ bottom: 124 } as DOMRect);
  }
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(collapse);
  const tip = document.getElementById(collapse.getAttribute("aria-describedby") ?? "")?.parentElement;
  expect(tip?.hidden).toBe(false);
  expect(tip?.style.top).toBe("28px");
  expect(tip?.style.borderTopWidth).toBe("100px");
});
