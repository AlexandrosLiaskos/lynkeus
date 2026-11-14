import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { BOOKMARK_FAULTS, bookmarksStore, readBookmarks } from "./bookmarks";
import { BookmarksPane } from "./BookmarksPane";
import { openPane } from "./testPane";

async function save(name: string) {
  await userEvent.type(screen.getByLabelText("Name of the view"), name);
  await userEvent.click(screen.getByRole("button", { name: "Save view" }));
}

function names(): (string | null)[] {
  return within(screen.getByRole("list", { name: "Saved views" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".bookmark-name")?.textContent ?? null);
}

beforeEach(() => {
  window.localStorage.clear();
  bookmarksStore.set([]);
  resetDock();
});

test("the view is saved under a name and listed", async () => {
  openPane("bookmarks", <BookmarksPane />);
  expect(screen.getByText("No view is saved.")).toBeDefined();
  await save("Merrimack");
  expect(names()).toEqual(["Merrimack"]);
  expect(screen.getByRole("status").textContent).toBe('The view was saved as "Merrimack".');
  expect(screen.getByLabelText<HTMLInputElement>("Name of the view").value).toBe("");
  expect(readBookmarks()[0]).toMatchObject({ name: "Merrimack", zoom: 10 });
});

test("a missing name and a name that is in use are refused in a sentence", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await userEvent.click(screen.getByRole("button", { name: "Save view" }));
  expect(screen.getByRole("alert").textContent).toBe(BOOKMARK_FAULTS.noName);
  await save("First");
  await save("First");
  expect(screen.getByRole("alert").textContent).toBe(BOOKMARK_FAULTS.sameName);
  expect(names()).toEqual(["First"]);
});

test("a click on the name of a bookmark returns the map to its view", async () => {
  const map = openPane("bookmarks", <BookmarksPane />);
  await save("Merrimack");
  map.getView().setZoom(3);
  await userEvent.click(screen.getByRole("button", { name: "Merrimack" }));
  expect(map.getView().getAnimating()).toBe(true);
});

test("a bookmark is renamed with the Enter key and removed", async () => {
  openPane("bookmarks", <BookmarksPane />);
  await save("First");
  await save("Second");
  await userEvent.click(screen.getByRole("button", { name: "Rename Second" }));
  const field = screen.getByLabelText("New name of Second");
  await userEvent.clear(field);
  await userEvent.type(field, "Third{Enter}");
  expect(names()).toEqual(["First", "Third"]);
  // The Enter key in that field has not saved the view again.
  expect(bookmarksStore.get()).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Rename Third" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await userEvent.click(screen.getByRole("button", { name: "Remove First" }));
  expect(names()).toEqual(["Third"]);
  expect(screen.getByRole("status").textContent).toBe('The bookmark "First" was removed.');
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("the field of the name is described by its explanation, which shows from the button beside its title", () => {
  openPane("bookmarks", <BookmarksPane />);
  expect(explanation(screen.getByLabelText("Name of the view"))).toMatch(
    /^The name under which the present view of the map is saved, .* does not send them to the server\.$/,
  );
  expect(screen.getByRole("button", { name: "Information about Name of the view" })).toBeDefined();
});
