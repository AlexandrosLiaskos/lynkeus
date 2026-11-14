import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import WebGLTileLayer from "ol/layer/WebGLTile";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import TileGrid from "ol/tilegrid/TileGrid";
import { beforeEach, expect, test, vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { extentOf, findLayer, valueAt } from "./display";

const LAYER: LayerDescription = {
  id: "coherence",
  title: "Coherence HH, 20 m",
  kind: "layer",
  url: "/files/coherence/coherence.tif",
  quantity: "Interferometric coherence magnitude, HH",
  unit: "1",
  range: [0, 1],
  colours: "grey",
  dates: ["2026-10-09", "2026-10-21"],
  inputs: ["NISAR_L2_PR_GUNW"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/coherence/coherence.json",
};

/** The pilot area in degrees: west, south, east, north. */
const AREA = [-71.2, 42.6, -70.75, 42.95] as const;

/** Web Mercator on the sphere of radius 6 378 137 m, written out here so that the test does not use OpenLayers. */
const RADIUS = 6378137;
const x = (longitude: number) => (RADIUS * longitude * Math.PI) / 180;
const y = (latitude: number) => RADIUS * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));

function layerInDegrees(id: string): TileLayer {
  const tileGrid = new TileGrid({ extent: [...AREA], origin: [AREA[0], AREA[3]], resolutions: [0.001], tileSize: 256 });
  return new TileLayer({ source: new XYZ({ projection: "EPSG:4326", tileGrid }), properties: { id } });
}

function mapWith(...layers: (TileLayer | VectorLayer | WebGLTileLayer)[]): OlMap {
  return new OlMap({ layers, view: new View({ center: [0, 0], zoom: 2 }) });
}

beforeEach(() => {
  mapLayersStore.set([]);
});

test("a layer is found by its id", () => {
  const layer = layerInDegrees("coherence");
  const map = mapWith(layerInDegrees("other"), layer);
  expect(findLayer(map, "coherence")).toBe(layer);
  expect(findLayer(map, "absent")).toBeUndefined();
});

test("the extent of a layer in degrees is given in the projection of the view", async () => {
  const extent = await extentOf(mapWith(layerInDegrees("coherence")), "coherence");
  const expected = [x(AREA[0]), y(AREA[1]), x(AREA[2]), y(AREA[3])];
  expect(extent).not.toBeNull();
  // The difference from the formulas above stays below one millimetre.
  extent?.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 3));
});

test("a layer that is absent or empty has no extent", async () => {
  const empty = new VectorLayer({ source: new VectorSource(), properties: { id: "area" } });
  const map = mapWith(empty);
  expect(await extentOf(map, "absent")).toBeNull();
  expect(await extentOf(map, "area")).toBeNull();
});

test("the extent waits until the source of the layer is ready", async () => {
  const layer = layerInDegrees("coherence");
  const source = layer.getSource();
  source?.setState("loading");
  const extent = extentOf(mapWith(layer), "coherence");
  source?.setState("ready");
  expect(await extent).not.toBeNull();
});

test("a layer whose file cannot be read has no extent", async () => {
  const layer = layerInDegrees("coherence");
  layer.getSource()?.setState("error");
  expect(await extentOf(mapWith(layer), "coherence")).toBeNull();
});

test("the value at a pixel is the first number of the drawn data, and null where the cell has no data", () => {
  const layer = new WebGLTileLayer({ properties: { id: "coherence" } });
  const map = mapWith(layer);
  mapLayersStore.set([LAYER]);
  const getData = vi.spyOn(layer, "getData");

  getData.mockReturnValue(new Float32Array([0.25, 1]));
  expect(valueAt(map, "coherence", [10, 10])).toBe(0.25);
  expect(getData).toHaveBeenCalledWith([10, 10]);

  getData.mockReturnValue(new Float32Array([0, 0]));
  expect(valueAt(map, "coherence", [10, 10])).toBeNull();
  getData.mockReturnValue(new Float32Array([0, 0.5]));
  expect(valueAt(map, "coherence", [10, 10])).toBeNull();
  // With decibels the value of the file is the second number.
  getData.mockReturnValue(new Float32Array([-6.0206, 0.25, 1]));
  expect(valueAt(map, "coherence", [10, 10])).toBe(0.25);
  getData.mockReturnValue(new Float32Array([Number.NaN, 1]));
  expect(valueAt(map, "coherence", [10, 10])).toBeNull();
  getData.mockReturnValue(null);
  expect(valueAt(map, "coherence", [10, 10])).toBeNull();
});

test("a hidden layer and a layer that is not in the Contents pane give no value", () => {
  const layer = new WebGLTileLayer({ properties: { id: "coherence" } });
  const map = mapWith(layer);
  vi.spyOn(layer, "getData").mockReturnValue(new Float32Array([0.25, 1]));
  expect(valueAt(map, "coherence", [10, 10])).toBeNull();
  mapLayersStore.set([LAYER]);
  layer.setVisible(false);
  expect(valueAt(map, "coherence", [10, 10])).toBeNull();
});
