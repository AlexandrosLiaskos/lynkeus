import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { areaStore } from "../shared/area";
import { resetDock } from "../shared/dock/dock";
import { AREA_FAULTS } from "./area";
import { AreaCoordinatesPane } from "./AreaCoordinatesPane";
import { openPane } from "./testPane";

const AREA = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };
const SIDES = ["West (°)", "South (°)", "East (°)", "North (°)"] as const;

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

test("the four sides that are typed become the area, and the foot offers to show the whole of it", async () => {
  const map = openPane("area-from-coordinates", <AreaCoordinatesPane />);
  expect(field("West (°)").value).toBe("");
  await type({ "West (°)": "-71.2", "South (°)": "42.6", "East (°)": "-70.75", "North (°)": "42.95" });
  await userEvent.click(screen.getByRole("button", { name: "Set area" }));
  expect(areaStore.get()).toEqual(AREA);
  expect(screen.getByRole("status").textContent).toBe("The area was set.");
  expect(map.getView().getAnimating()).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Zoom to area" }));
  expect(map.getView().getAnimating()).toBe(true);
});

test("the run button is inactive until the four sides hold a text, and the foot names the first empty one", async () => {
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  const run = screen.getByRole("button", { name: "Set area" });
  expect(run.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("Enter the west side of the area.");
  await type({ "West (°)": "-71.2", "South (°)": "42.6" });
  expect(screen.getByRole("status").textContent).toBe("Enter the east side of the area.");
  await type({ "East (°)": "-70.75", "North (°)": "42.95" });
  expect(run.getAttribute("aria-disabled")).toBeNull();
});

test("sides that are not an area are refused under the fields and the area stays", async () => {
  areaStore.set(AREA);
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  await type({ "West (°)": "10" });
  await userEvent.click(screen.getByRole("button", { name: "Set area" }));
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe(AREA_FAULTS.limits);
  const group = screen.getByRole("group", { name: "Sides of the area" });
  expect(group.getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(field("West (°)").getAttribute("aria-invalid")).toBe("true");
  await type({ "West (°)": "west" });
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("alert").textContent).toBe(AREA_FAULTS.numbers);
  expect(areaStore.get()).toBe(AREA);
});

test("the fields show the area and follow it when another tool changes it", () => {
  areaStore.set(AREA);
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  expect(SIDES.map((name) => field(name).value)).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
  act(() => areaStore.set({ west: 22.2, south: 36.4, east: 22.6, north: 36.9 }));
  expect(field("East (°)").value).toBe("22.6");
  act(() => areaStore.set(null));
  expect(field("East (°)").value).toBe("");
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("the group of the four sides keeps its name and is described by its explanation", () => {
  openPane("area-from-coordinates", <AreaCoordinatesPane />);
  const group = screen.getByRole("group", { name: "Sides of the area" });
  expect(explanation(group)).toMatch(/^Each side is a number of decimal degrees .* south is smaller than north\.$/);
  expect(screen.getByRole("button", { name: "Information about Sides of the area" })).toBeDefined();
});
