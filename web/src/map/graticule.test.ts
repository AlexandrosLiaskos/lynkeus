import Graticule from "ol/layer/Graticule";
import { expect, test } from "vitest";
import { createGraticule, GRATICULE_LAYER_ID } from "./graticule";

test("the lines of latitude and longitude start hidden and are drawn above the layers of the map", () => {
  const graticule = createGraticule();
  expect(graticule.get("id")).toBe(GRATICULE_LAYER_ID);
  expect(graticule.getVisible()).toBe(false);
  const layers = graticule.getLayers().getArray();
  expect(layers.every((layer) => layer instanceof Graticule)).toBe(true);
  expect(layers.map((layer) => layer.getZIndex())).toEqual([1000, 1001]);
});
