import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { GO_TO_FAULTS, GoToPane } from "./GoToPane";
import { markStore } from "./mark";
import { openPane } from "./testPane";

async function go(latitude: string, longitude: string) {
  for (const [name, text] of [
    ["Latitude", latitude],
    ["Longitude", longitude],
  ] as const) {
    await userEvent.clear(screen.getByLabelText(name));
    if (text !== "") {
      await userEvent.type(screen.getByLabelText(name), text);
    }
  }
  await userEvent.click(screen.getByRole("button", { name: "Go to" }));
}

beforeEach(() => {
  markStore.set(null);
  resetDock();
});

test("a typed place moves the map and is marked", async () => {
  const map = openPane("go-to-coordinates", <GoToPane />);
  await go("42° 48′ 30″ N", "70.9 W");
  expect(map.getView().getAnimating()).toBe(true);
  expect(markStore.get()?.[0]).toBeCloseTo(-70.9, 12);
  expect(markStore.get()?.[1]).toBeCloseTo(42 + 48 / 60 + 30 / 3600, 12);
  expect(screen.getByRole("status").textContent).toBe("The centre of the map is 42.80833° N, 70.90000° W.");
  expect(screen.getByText(/^A mark stands at 42\.80833° N, 70\.90000° W\./)).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Remove the mark" }));
  expect(markStore.get()).toBeNull();
});

test("the place is not marked when the box is not ticked", async () => {
  openPane("go-to-coordinates", <GoToPane />);
  await userEvent.click(screen.getByLabelText("Mark the place on the map"));
  await go("-43.77", "170.13");
  expect(markStore.get()).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("The centre of the map is 43.77000° S, 170.13000° E.");
});

test("a text that is not a latitude or a longitude is refused in a sentence", async () => {
  const map = openPane("go-to-coordinates", <GoToPane />);
  await go("north", "10");
  expect(screen.getByRole("alert").textContent).toBe(GO_TO_FAULTS.latitude);
  await go("10", "190");
  expect(screen.getByRole("alert").textContent).toBe(GO_TO_FAULTS.longitude);
  await go("86", "10");
  expect(screen.getByRole("alert").textContent).toBe("The map ends at 85.05 degrees of latitude, north and south.");
  expect(map.getView().getAnimating()).toBe(false);
  expect(markStore.get()).toBeNull();
});
