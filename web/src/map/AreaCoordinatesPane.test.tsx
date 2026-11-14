import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { areaStore } from "../shared/area";
import { resetDock } from "../shared/dock/dock";
import { AREA_FAULTS } from "./area";
import { AreaCoordinatesPane } from "./AreaCoordinatesPane";
import { openPane } from "./testPane";

const AREA = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };

function field(name: string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(name);
}

async function type(sides: Record<string, string>) {
  for (const [name, text] of Object.entries(sides)) {
    await userEvent.clear(field(name));
    if (text !== "") {
      await userEvent.type(field(name), text);
    }
  }
}

beforeEach(() => {
  areaStore.set(null);
  resetDock();
});

test("the four sides that are typed become the area", async () => {
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  expect(field("West").value).toBe("");
  await type({ West: "-71.2", South: "42.6", East: "-70.75", North: "42.95" });
  await userEvent.click(screen.getByRole("button", { name: "Set area" }));
  expect(areaStore.get()).toEqual(AREA);
  expect(screen.getByRole("status").textContent).toBe("The area was set.");
});

test("sides that are not an area are refused in a sentence and the area stays", async () => {
  areaStore.set(AREA);
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  await type({ West: "10" });
  await userEvent.click(screen.getByRole("button", { name: "Set area" }));
  expect(screen.getByRole("alert").textContent).toBe(AREA_FAULTS.limits);
  await type({ West: "" });
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("alert").textContent).toBe(AREA_FAULTS.numbers);
  expect(areaStore.get()).toBe(AREA);
});

test("the fields show the area and follow it when another tool changes it", () => {
  areaStore.set(AREA);
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  expect(["West", "South", "East", "North"].map((name) => field(name).value)).toEqual([
    "-71.2",
    "42.6",
    "-70.75",
    "42.95",
  ]);
  act(() => areaStore.set({ west: 22.2, south: 36.4, east: 22.6, north: 36.9 }));
  expect(field("East").value).toBe("22.6");
  act(() => areaStore.set(null));
  expect(field("East").value).toBe("");
});
