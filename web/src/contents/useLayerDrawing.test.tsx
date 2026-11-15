import { act, render } from "@testing-library/react";
import OlMap from "ol/Map";
import { beforeEach, expect, test, vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { dropShapeLayer, putShapeLayer, setLayerOrder, shapeLayersStore, type ShapeLayer } from "../shared/shapeLayers";
import { drawAgain, drawAgainStore } from "./drawing";
import { displayStore, selectedLayerStore, setDisplay } from "./state";
import { useLayerDrawing } from "./useLayerDrawing";

// The drawing itself needs a real browser. Here it only records what the hook asks of it. The store of the
// layers to draw again stays the real one.
const { update, clear } = vi.hoisted(() => ({ update: vi.fn(), clear: vi.fn() }));
vi.mock("./drawing", async (original) => ({
  ...(await original<typeof import("./drawing")>()),
  LayerDrawing: class {
    update = update;
    clear = clear;
  },
}));

function layer(id: string): LayerDescription {
  return {
    id,
    title: id,
    kind: "layer",
    url: `/files/${id}/${id}.tif`,
    quantity: "Interferometric coherence magnitude, HH",
    unit: "1",
    range: [0, 1],
    colours: "grey",
    dates: ["2026-10-21"],
    inputs: ["NISAR_L2_PR_GUNW"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}/${id}.json`,
  };
}

function shape(id: string): ShapeLayer {
  return { id, title: id, symbols: [], properties: [], remove: () => dropShapeLayer(id) };
}

function Drawn() {
  useLayerDrawing();
  return null;
}

function show() {
  return render(
    <MapContext value={new OlMap({})}>
      <Drawn />
    </MapContext>,
  );
}

beforeEach(() => {
  update.mockClear();
  clear.mockClear();
  mapLayersStore.set([]);
  shapeLayersStore.set([]);
  displayStore.set({});
  drawAgainStore.set({});
  selectedLayerStore.set(null);
});

test("the layers are drawn with the drawing order of all the layers, and again when that order changes", () => {
  ["a", "b"].forEach((id) => addToMap(layer(id)));
  putShapeLayer(shape("area"));
  show();
  expect(update).toHaveBeenLastCalledWith(mapLayersStore.get(), {}, ["a", "b", "area"], {});
  // The shape layer moves between the two layers: their own store stays as it was, and they are drawn again.
  const calls = update.mock.calls.length;
  act(() => setLayerOrder(["a", "area", "b"]));
  expect(update.mock.calls.length).toBe(calls + 1);
  expect(update).toHaveBeenLastCalledWith(mapLayersStore.get(), {}, ["a", "area", "b"], {});
  act(() => putShapeLayer(shape("products")));
  expect(update).toHaveBeenLastCalledWith(mapLayersStore.get(), {}, ["a", "area", "b", "products"], {});
  act(() => setDisplay(layer("a"), { opacity: 0.5 }));
  expect(update).toHaveBeenLastCalledWith(mapLayersStore.get(), displayStore.get(), ["a", "area", "b", "products"], {});
});

test("a layer that the visitor asks to draw again is drawn again, with the number of times asked", () => {
  addToMap(layer("a"));
  show();
  const calls = update.mock.calls.length;
  act(() => drawAgain("a"));
  expect(update.mock.calls.length).toBe(calls + 1);
  expect(update).toHaveBeenLastCalledWith(mapLayersStore.get(), {}, ["a"], { a: 1 });
});

test("a selected shape layer keeps its selection while it is on the map, and loses it when it is dropped", () => {
  putShapeLayer(shape("area"));
  selectedLayerStore.set("area");
  show();
  expect(selectedLayerStore.get()).toBe("area");
  act(() => addToMap(layer("a")));
  expect(selectedLayerStore.get()).toBe("area");
  act(() => dropShapeLayer("area"));
  expect(selectedLayerStore.get()).toBeNull();
});

test("the layers leave the map with the element that draws them", () => {
  const { unmount } = show();
  unmount();
  expect(clear).toHaveBeenCalledTimes(1);
});
