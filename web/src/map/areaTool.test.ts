import OlMap from "ol/Map";
import View from "ol/View";
import { expect, test, vi } from "vitest";
import { BOX, createAreaLayer } from "./areaLayer";
import { startAreaTool } from "./areaTool";

function start() {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 5 }) });
  const layer = createAreaLayer();
  map.addLayer(layer);
  const events = { onRectangle: vi.fn(), onCancel: vi.fn(), onCorner: vi.fn() };
  return { map, layer, events, tool: startAreaTool(map, layer, events) };
}

test("the tool adds its two interactions to the map and removes them when it ends", () => {
  const { map, tool } = start();
  const before = map.getInteractions().getLength();
  tool.stop();
  expect(map.getInteractions().getLength()).toBe(before - 2);
});

test("with the keyboard, two corners set at the centre of the map give the rectangle", () => {
  const { map, layer, events, tool } = start();
  tool.point([1000, 2000]);
  expect(events.onCorner).toHaveBeenCalledTimes(1);
  expect(events.onRectangle).not.toHaveBeenCalled();
  // The rectangle follows the centre of the map while the arrow keys move the map.
  map.getView().setCenter([-3000, 500]);
  expect(layer.getSource()?.getFeatureById(BOX)?.getGeometry()?.getExtent()).toEqual([-3000, 500, 1000, 2000]);
  tool.point([-3000, 500]);
  expect(events.onRectangle).toHaveBeenCalledWith([-3000, 500, 1000, 2000]);
  // The next corner starts a new rectangle.
  tool.point([0, 0]);
  expect(events.onCorner).toHaveBeenCalledTimes(2);
  expect(events.onRectangle).toHaveBeenCalledTimes(1);
});

test("a rectangle that is being drawn can be given up", () => {
  const { events, tool } = start();
  expect(tool.cancel()).toBe(false);
  tool.point([1000, 2000]);
  expect(tool.cancel()).toBe(true);
  expect(events.onCancel).toHaveBeenCalledTimes(1);
  expect(tool.cancel()).toBe(false);
});
