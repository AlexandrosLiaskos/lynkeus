import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MenuButton } from "./MenuButton";

const button = (name: string) => screen.getByRole("button", { name });
const command = (name: string) => screen.getByRole("menuitem", { name });

/** A menu button with two commands and an inactive third one, beside another element of the page. */
function SaveAs({ onCsv = vi.fn(), onShapefile = vi.fn() }: { onCsv?: () => void; onShapefile?: () => void }) {
  return (
    <>
      <MenuButton
        label="Save as"
        items={[
          { label: "CSV", onSelect: onCsv },
          { label: "GeoJSON", onSelect: vi.fn() },
          { label: "Shapefile", onSelect: onShapefile, disabled: true, separated: true },
        ]}
      />
      <input aria-label="Other" />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("the button states that it opens a menu, and that the menu is closed", () => {
  render(<SaveAs />);
  expect(button("Save as").getAttribute("aria-haspopup")).toBe("menu");
  expect(button("Save as").hasAttribute("aria-expanded")).toBe(false);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("a press opens the menu under the button, with the focus on its first command", async () => {
  render(<SaveAs />);
  vi.spyOn(button("Save as"), "getBoundingClientRect").mockReturnValue({ left: 40, bottom: 120 } as DOMRect);
  await userEvent.click(button("Save as"));
  const menu = screen.getByRole("menu", { name: "Save as" });
  expect(button("Save as").getAttribute("aria-expanded")).toBe("true");
  expect(button("Save as").getAttribute("aria-controls")).toBe(menu.id);
  expect(menu.style.left).toBe("40px");
  expect(menu.style.top).toBe("120px");
  expect(document.activeElement).toBe(command("CSV"));
});

test("a second press on the button closes the menu", async () => {
  render(<SaveAs />);
  await userEvent.click(button("Save as"));
  await userEvent.click(button("Save as"));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(button("Save as").hasAttribute("aria-expanded")).toBe(false);
  await userEvent.click(button("Save as"));
  expect(screen.getByRole("menu")).toBeDefined();
});

test("the Enter, Space and Down arrow keys open the menu at its first command, the Up arrow key at its last", async () => {
  render(<SaveAs />);
  for (const [key, first] of [
    ["{Enter}", "CSV"],
    [" ", "CSV"],
    ["{ArrowDown}", "CSV"],
    ["{ArrowUp}", "Shapefile"],
  ] as const) {
    button("Save as").focus();
    await userEvent.keyboard(key);
    expect(document.activeElement).toBe(command(first));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button("Save as"));
  }
});

test("a command runs, closes the menu and returns the focus to the button", async () => {
  const onCsv = vi.fn();
  render(<SaveAs onCsv={onCsv} />);
  await userEvent.click(button("Save as"));
  await userEvent.click(command("CSV"));
  expect(onCsv).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(button("Save as"));
});

test("an inactive command does nothing and leaves the menu open", async () => {
  const onShapefile = vi.fn();
  render(<SaveAs onShapefile={onShapefile} />);
  await userEvent.click(button("Save as"));
  expect(command("Shapefile").getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(command("Shapefile"));
  expect(onShapefile).not.toHaveBeenCalled();
  expect(screen.getByRole("menu")).toBeDefined();
});

test("a press outside the menu closes it and leaves the focus where the press put it", async () => {
  render(<SaveAs />);
  await userEvent.click(button("Save as"));
  await userEvent.click(screen.getByRole("textbox", { name: "Other" }));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Other" }));
});

test("with an icon the button shows the icon alone and is named by its label", async () => {
  const remove = vi.fn();
  render(<MenuButton icon="more_vert" label="More" items={[{ label: "Remove", onSelect: remove }]} />);
  expect(button("More").textContent).toBe("");
  expect(button("More").classList.contains("icon-button")).toBe(true);
  expect(screen.getByRole("tooltip", { hidden: true }).textContent).toBe("More");
  fireEvent.click(button("More"));
  await userEvent.click(command("Remove"));
  expect(remove).toHaveBeenCalledTimes(1);
});

test("a command that switches something on and off states whether it is on", async () => {
  render(<MenuButton label="View" items={[{ label: "Outlines on the map", onSelect: vi.fn(), checked: true }]} />);
  await userEvent.click(button("View"));
  expect(screen.getByRole("menuitemcheckbox", { name: "Outlines on the map" }).getAttribute("aria-checked")).toBe(
    "true",
  );
});
