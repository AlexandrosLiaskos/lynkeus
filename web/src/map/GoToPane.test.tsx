// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { GO_TO_FAULTS, GoToPane } from "./GoToPane";
import { markStore } from "./mark";
import { openPane } from "./testPane";

async function type(latitude: string, longitude: string) {
  for (const [name, text] of [
    ["Latitude", latitude],
    ["Longitude", longitude],
  ] as const) {
    await userEvent.clear(screen.getByLabelText(name));
    if (text !== "") {
      await userEvent.type(screen.getByLabelText(name), text);
    }
  }
}

async function go(latitude: string, longitude: string) {
  await type(latitude, longitude);
  await userEvent.click(screen.getByRole("button", { name: "Go to place" }));
}

beforeEach(() => {
  markStore.set(null);
  resetDock();
});

test("a typed place moves the map and is marked, and the notice of the mark removes it", async () => {
  const map = openPane("go-to-coordinates", <GoToPane />);
  await go("42° 48′ 30″ N", "70.9 W");
  expect(map.getView().getAnimating()).toBe(true);
  expect(markStore.get()?.[0]).toBeCloseTo(-70.9, 12);
  expect(markStore.get()?.[1]).toBeCloseTo(42 + 48 / 60 + 30 / 3600, 12);
  expect(screen.getByText("The centre of the map is 42.80833° N, 70.90000° W.").getAttribute("role")).toBe("status");
  expect(screen.getByText("The mark is at 42.80833° N, 70.90000° W.").getAttribute("role")).toBe("status");
  await userEvent.click(screen.getByRole("button", { name: "Remove mark" }));
  expect(markStore.get()).toBeNull();
  expect(screen.queryByText(/^The mark is at/)).toBeNull();
});

test("the place is not marked when the box is not ticked", async () => {
  openPane("go-to-coordinates", <GoToPane />);
  await userEvent.click(screen.getByLabelText("Mark the place on the map"));
  await go("-43.77", "170.13");
  expect(markStore.get()).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("The centre of the map is 43.77000° S, 170.13000° E.");
});

test("the run button is inactive until both fields hold a text, and the foot names the first empty one", async () => {
  openPane("go-to-coordinates", <GoToPane />);
  const run = screen.getByRole("button", { name: "Go to place" });
  expect(run.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("Enter the latitude.");
  await type("42.8", "");
  expect(screen.getByRole("status").textContent).toBe("Enter the longitude.");
  await type("42.8", "-70.9");
  expect(run.getAttribute("aria-disabled")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

test("a text that is not a latitude or a longitude is refused under its field", async () => {
  const map = openPane("go-to-coordinates", <GoToPane />);
  await go("north", "10");
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(GO_TO_FAULTS.latitude);
  expect(screen.getByLabelText("Latitude").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByLabelText("Latitude").getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(screen.getByLabelText("Longitude").getAttribute("aria-invalid")).toBeNull();
  await go("10", "190");
  expect(screen.getByRole("alert").textContent).toBe(GO_TO_FAULTS.longitude);
  await go("86", "10");
  expect(screen.getByRole("alert").textContent).toBe(
    "The map ends at 85.05 degrees north and south. Enter a latitude between these limits.",
  );
  expect(map.getView().getAnimating()).toBe(false);
  expect(markStore.get()).toBeNull();
});

test("the error of a field appears when the field is left and goes when its text changes", async () => {
  openPane("go-to-coordinates", <GoToPane />);
  await userEvent.type(screen.getByLabelText("Latitude"), "north");
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.tab();
  expect(screen.getByRole("alert").textContent).toBe(GO_TO_FAULTS.latitude);
  await userEvent.type(screen.getByLabelText("Latitude"), "{Backspace}");
  expect(screen.queryByRole("alert")).toBeNull();
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("each field is described by its explanation, which shows from the button beside its title", () => {
  openPane("go-to-coordinates", <GoToPane />);
  expect(explanation(screen.getByLabelText("Latitude"))).toMatch(
    /^The latitude of the place, from 90 degrees south to 90 degrees north\. .* as 42° 48′ 30″ N\./,
  );
  expect(explanation(screen.getByLabelText("Longitude"))).toMatch(
    /^The longitude of the place, from 180 degrees west to 180 degrees east\. .* as 70° 54′ 00″ W\./,
  );
  expect(screen.getByRole("button", { name: "Information about Latitude" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Information about Longitude" })).toBeDefined();
});
