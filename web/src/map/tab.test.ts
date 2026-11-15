import { expect, test } from "vitest";
import type { RibbonTab } from "../ribbon/types";
import { MAP_TAB } from "./tab";

const tab: RibbonTab = MAP_TAB;
const descriptions = new Map(tab.groups.flatMap(({ tools }) => tools.map(({ id, description }) => [id, description])));

test("a button that acts on the selected layer names the Contents pane in its description", () => {
  expect(descriptions.get("zoom-to-layer")).toMatch(/the layer that is selected in the Contents pane/);
  expect(descriptions.get("swipe")).toMatch(/the layer that is selected in the Contents pane/);
});

test("the descriptions name the map under the layers the basemap", () => {
  for (const id of ["blue-marble", "openstreetmap", "imagery-of-a-date"]) {
    expect(descriptions.get(id)).toMatch(/ as the basemap\.$/);
  }
  for (const description of descriptions.values()) {
    expect(description).not.toMatch(/background map/);
  }
});
