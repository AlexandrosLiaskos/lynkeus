import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { BOOKMARK_FAULTS, bookmarksStore, readBookmarks } from "./bookmarks";
import { BookmarksPane } from "./BookmarksPane";
import { openPane } from "./testPane";

function nameField(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>("Name");
}

async function save(name: string) {
  await userEvent.type(nameField(), name);
  await userEvent.click(screen.getByRole("button", { name: "Save view" }));
}

function names(): (string | null)[] {
  return within(screen.getByRole("list", { name: "Saved views" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".item-title")?.textContent ?? null);
}

/** Choose a command in the menu More of a saved view. */
async function choose(view: string, command: string) {
  const item = screen.getByText(view, { selector: ".item-title" }).closest("li");
  if (!item) {
    throw new Error(`the view ${view} is not listed`);
  }
  await userEvent.click(within(item).getByRole("button", { name: `More commands of ${view}` }));
  await userEvent.click(screen.getByRole("menuitem", { name: command }));
}

beforeEach(() => {
  window.localStorage.clear();
  bookmarksStore.set([]);
  resetDock();
});

test("a pane without saved views names the next step, and the run button waits for a name", async () => {
  openPane("bookmarks", <BookmarksPane />);
  expect(screen.getByText("No saved views")).toBeDefined();
  expect(screen.getByText("Enter a name and press Save view to keep the present view.")).toBeDefined();
  expect(screen.queryByRole("list", { name: "Saved views" })).toBeNull();
  const run = screen.getByRole("button", { name: "Save view" });
  expect(run.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("Enter a name for the view.");
  await userEvent.type(nameField(), "Merrimack");
  expect(run.getAttribute("aria-disabled")).toBeNull();
});

test("the view is saved under a name and listed", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("Merrimack");
  expect(names()).toEqual(["Merrimack"]);
  expect(screen.getByRole("button", { name: "Saved views (1)" })).toBeDefined();
  expect(screen.getByText('The view was saved as "Merrimack".').getAttribute("role")).toBe("status");
  expect(nameField().value).toBe("");
  expect(readBookmarks()[0]).toMatchObject({ name: "Merrimack", zoom: 10 });
});

test("a name that is in use and a name that is too long are refused under the field", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("First");
  await save("First");
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(BOOKMARK_FAULTS.sameName);
  expect(nameField().getAttribute("aria-invalid")).toBe("true");
  expect(nameField().getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(nameField().value).toBe("First");
  expect(names()).toEqual(["First"]);
  await userEvent.type(nameField(), "x".repeat(60));
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Save view" }));
  expect(screen.getByRole("alert").textContent).toBe(BOOKMARK_FAULTS.longName);
  expect(names()).toEqual(["First"]);
});

test("the one button of a saved view returns the map to it", async () => {
  const map = openPane("bookmarks", <BookmarksPane />);
  await save("Merrimack");
  map.getView().setZoom(3);
  await userEvent.click(screen.getByRole("button", { name: "Go to Merrimack" }));
  expect(map.getView().getAnimating()).toBe(true);
});

test("the menu More renames a saved view with the Enter key, and the focus follows the field and its item", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("First");
  await save("Second");
  await choose("Second", "Rename");
  const field = screen.getByLabelText("New name of Second");
  expect(document.activeElement).toBe(field);
  await userEvent.clear(field);
  await userEvent.type(field, "Third{Enter}");
  expect(names()).toEqual(["First", "Third"]);
  // The Enter key in that field has not saved the view again.
  expect(bookmarksStore.get()).toHaveLength(2);
  expect(screen.getByText('The saved view is now named "Third".')).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Go to Third" }));
});

test("a new name is given up with the button Cancel and with the Escape key", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("First");
  await choose("First", "Rename");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(names()).toEqual(["First"]);
  await choose("First", "Rename");
  await userEvent.type(screen.getByLabelText("New name of First"), "x{Escape}");
  expect(names()).toEqual(["First"]);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Go to First" }));
});

test("a new name that another saved view has is refused under its field", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("First");
  await save("Second");
  await choose("Second", "Rename");
  const field = screen.getByLabelText("New name of Second");
  await userEvent.clear(field);
  await userEvent.type(field, "First");
  await userEvent.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByRole("alert").textContent).toBe(BOOKMARK_FAULTS.sameName);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(bookmarksStore.get().map(({ name }) => name)).toEqual(["First", "Second"]);
});

test("the menu More removes a saved view, and the focus passes to the next view or to the field of the name", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("First");
  await save("Second");
  await choose("First", "Remove");
  expect(names()).toEqual(["Second"]);
  expect(screen.getByText('The saved view "First" was removed.')).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Go to Second" }));
  await choose("Second", "Remove");
  expect(screen.getByText("No saved views")).toBeDefined();
  expect(document.activeElement).toBe(nameField());
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("the field of the name is described by its explanation, which shows from the button beside its title", () => {
  openPane("bookmarks", <BookmarksPane />);
  expect(explanation(nameField())).toMatch(
    /^The name under which the present view of the map is saved, of at most 60 characters\. .* does not send them to the server\.$/,
  );
  expect(screen.getByRole("button", { name: "Information about Name" })).toBeDefined();
});
