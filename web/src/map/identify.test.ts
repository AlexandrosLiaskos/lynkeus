import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { displayStore, setDisplay } from "../contents/state";
import { mapLayersStore } from "../shared/mapLayers";
import { formatValue, identifyAt } from "./identify";
import { testLayer as layer } from "./testLayer";

vi.mock("../contents/display", () => ({
  // The simulated browser draws no layer, so the value of a layer at a pixel is given here.
  valueAt: (_map: unknown, id: string) => (id === "first" ? 0.0345 : null),
}));

function start() {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
  // The simulated browser draws no map, so the pixel of the centre is given here.
  map.getCoordinateFromPixel = () => fromLonLat([-70.9, 42.8]);
  return map;
}

beforeEach(() => {
  mapLayersStore.set([]);
  displayStore.set({});
});

test("the place and the value of every visible layer are read, the top layer first", () => {
  const first = layer("first", "First");
  const second = layer("second", "Second");
  const hidden = layer("hidden", "Hidden");
  mapLayersStore.set([first, hidden, second]);
  setDisplay(hidden, { visible: false });
  const found = identifyAt(start(), [400, 300]);
  expect(found?.place[0]).toBeCloseTo(-70.9, 9);
  expect(found?.place[1]).toBeCloseTo(42.8, 9);
  expect(found?.layers.map(({ id, value }) => [id, value])).toEqual([
    ["second", null],
    ["first", 0.0345],
  ]);
  expect(found?.layers[1]).toMatchObject({
    title: "First",
    quantity: "Radar backscatter (gamma nought), HH",
    unit: "linear power",
    dates: ["2026-10-21"],
  });
});

test("a map without layers gives the place alone, and a map that is not drawn gives nothing", () => {
  expect(identifyAt(start(), [400, 300])?.layers).toEqual([]);
  expect(identifyAt(new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) }), [400, 300])).toBeNull();
});

test("a value is written with six significant digits", () => {
  expect(formatValue(0.034512345)).toBe("0.0345123");
  expect(formatValue(-12.3456789)).toBe("-12.3457");
  expect(formatValue(1234567.89)).toBe("1,234,570");
  expect(formatValue(0)).toBe("0");
  expect(formatValue(0.0000123456)).toBe("1.23456E-5");
});
