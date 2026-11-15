// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MenuButton } from "../menu/MenuButton";
import { restPointerOn, takePointerOff } from "../tooltip/pointer";
import { IconButton } from "./IconButton";
import { Toolbar } from "./Toolbar";

const button = (name: string) => screen.getByRole("button", { name });

/** A toolbar of three commands between two other elements of the page. */
function Bar({ onRemove = vi.fn() }: { onRemove?: () => void }) {
  return (
    <>
      <input aria-label="Before" />
      <Toolbar label="Commands of the layer">
        <IconButton icon="zoom_in" label="Zoom to the layer" onClick={vi.fn()} />
        <IconButton icon="tune" label="Symbology" onClick={vi.fn()} />
        <MenuButton icon="more_vert" label="More" items={[{ label: "Remove", onSelect: onRemove }]} />
      </Toolbar>
      <input aria-label="After" />
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

test("an icon button is named by its label and runs its command", async () => {
  const zoom = vi.fn();
  render(<IconButton icon="zoom_in" label="Zoom to the layer" onClick={zoom} />);
  expect(button("Zoom to the layer").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(button("Zoom to the layer").hasAttribute("aria-pressed")).toBe(false);
  await userEvent.click(button("Zoom to the layer"));
  expect(zoom).toHaveBeenCalledTimes(1);
});

test("a button that switches something on and off states whether it is on", () => {
  const { rerender } = render(
    <IconButton icon="visibility" label="Show on the map" pressed={false} onClick={vi.fn()} />,
  );
  expect(button("Show on the map").getAttribute("aria-pressed")).toBe("false");
  rerender(<IconButton icon="visibility" label="Show on the map" pressed onClick={vi.fn()} />);
  expect(button("Show on the map").getAttribute("aria-pressed")).toBe("true");
});

test("an inactive button takes the focus, does nothing and is described by what is missing", async () => {
  const remove = vi.fn();
  render(<IconButton icon="delete" label="Remove" disabled reason="The basemap cannot be removed." onClick={remove} />);
  await userEvent.tab();
  expect(document.activeElement).toBe(button("Remove"));
  expect(button("Remove").getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(button("Remove"));
  expect(remove).not.toHaveBeenCalled();
  const description = document.getElementById(button("Remove").getAttribute("aria-describedby") ?? "");
  expect(description?.textContent).toBe("The basemap cannot be removed.");
});

test("an active button has no description, and its reason is not shown", () => {
  vi.useFakeTimers();
  render(<IconButton icon="delete" label="Remove" reason="The basemap cannot be removed." onClick={vi.fn()} />);
  expect(button("Remove").hasAttribute("aria-describedby")).toBe(false);
  restPointerOn(button("Remove"));
  expect(screen.getByRole("tooltip").textContent).toBe("Remove");
});

test("the name of an icon button shows in a tooltip while the pointer rests on it", () => {
  vi.useFakeTimers();
  render(<IconButton icon="zoom_in" label="Zoom to the layer" onClick={vi.fn()} />);
  expect(screen.queryByRole("tooltip")).toBeNull();
  restPointerOn(button("Zoom to the layer"));
  expect(screen.getByRole("tooltip").textContent).toBe("Zoom to the layer");
  takePointerOff(button("Zoom to the layer"));
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the toolbar is named, and the Tab key reaches it once", async () => {
  render(<Bar />);
  expect(screen.getByRole("toolbar", { name: "Commands of the layer" })).toBeDefined();
  screen.getByRole("textbox", { name: "Before" }).focus();
  await userEvent.tab();
  expect(document.activeElement).toBe(button("Zoom to the layer"));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "After" }));
});

test("the arrow keys move between the buttons and pass from the last to the first", async () => {
  render(<Bar />);
  button("Zoom to the layer").focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(button("Symbology"));
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  expect(document.activeElement).toBe(button("Zoom to the layer"));
  await userEvent.keyboard("{ArrowLeft}");
  expect(document.activeElement).toBe(button("More"));
  await userEvent.keyboard("{Home}");
  expect(document.activeElement).toBe(button("Zoom to the layer"));
  await userEvent.keyboard("{End}");
  expect(document.activeElement).toBe(button("More"));
});

test("the Tab key returns to the button that had the focus last", async () => {
  render(<Bar />);
  button("Zoom to the layer").focus();
  await userEvent.keyboard("{ArrowRight}");
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "After" }));
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(button("Symbology"));
});

test("the arrow keys inside the menu of a toolbar button stay in the menu", async () => {
  const onRemove = vi.fn();
  render(<Bar onRemove={onRemove} />);
  button("More").focus();
  await userEvent.keyboard("{Enter}");
  const remove = screen.getByRole("menuitem", { name: "Remove" });
  expect(document.activeElement).toBe(remove);
  await userEvent.keyboard("{ArrowLeft}");
  expect(document.activeElement).toBe(remove);
  await userEvent.keyboard("{Enter}");
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(button("More"));
});
