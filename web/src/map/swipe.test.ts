import OlMap from "ol/Map";
import VectorLayer from "ol/layer/Vector";
import RenderEvent from "ol/render/Event";
import { expect, test, vi } from "vitest";
import { clipLayer, shareAfterKey, swipePart, type Swipe } from "./swipe";

test("the swiped layer is drawn on the left of an upright line and under a level line", () => {
  expect(swipePart([800, 600], { on: true, line: "upright", share: 25 })).toEqual([0, 0, 200, 600]);
  expect(swipePart([800, 600], { on: true, line: "level", share: 25 })).toEqual([0, 450, 800, 150]);
  expect(swipePart([800, 600], { on: true, line: "upright", share: 0 })).toEqual([0, 0, 0, 600]);
  expect(swipePart([800, 600], { on: true, line: "level", share: 100 })).toEqual([0, 0, 800, 600]);
});

test("the right and up arrows increase the share by one percent, the left and down arrows decrease it, and the page keys change it by ten", () => {
  expect(shareAfterKey(50, "ArrowRight")).toBe(51);
  expect(shareAfterKey(50, "ArrowUp")).toBe(51);
  expect(shareAfterKey(50, "ArrowLeft")).toBe(49);
  expect(shareAfterKey(50, "ArrowDown")).toBe(49);
  expect(shareAfterKey(50, "PageUp")).toBe(60);
  expect(shareAfterKey(50, "PageDown")).toBe(40);
});

test("the Home and End keys move the line to the edges, and the line stays on the map", () => {
  expect(shareAfterKey(50, "Home")).toBe(0);
  expect(shareAfterKey(50, "End")).toBe(100);
  expect(shareAfterKey(99.5, "ArrowRight")).toBe(100);
  expect(shareAfterKey(4, "PageDown")).toBe(0);
  expect(shareAfterKey(50, "Enter")).toBeUndefined();
});

function start(swipe: Swipe) {
  const map = new OlMap({});
  map.setSize([800, 600]);
  const layer = new VectorLayer();
  return { layer, end: clipLayer(map, layer, () => swipe) };
}

test("a layer that is drawn with WebGL is cut with the scissor, which counts from the bottom left corner", () => {
  const { layer, end } = start({ on: true, line: "level", share: 25 });
  const gl = { SCISSOR_TEST: 3089, enable: vi.fn(), disable: vi.fn(), scissor: vi.fn() };
  const context = gl as unknown as WebGLRenderingContext;
  // The transform of a WebGL layer of 800 by 600 pixels turns the vertical axis over.
  const transform = [1, 0, 0, -1, 0, 600];
  layer.dispatchEvent(new RenderEvent("prerender", transform, undefined, context));
  expect(gl.enable).toHaveBeenCalledWith(3089);
  // The lower quarter of the map: 150 pixels from the bottom.
  expect(gl.scissor).toHaveBeenCalledWith(0, 0, 800, 150);
  layer.dispatchEvent(new RenderEvent("postrender", transform, undefined, context));
  expect(gl.disable).toHaveBeenCalledWith(3089);
  end();
  layer.dispatchEvent(new RenderEvent("prerender", transform, undefined, context));
  expect(gl.scissor).toHaveBeenCalledTimes(1);
});

test("a layer that is drawn on a canvas is cut with a clip path, which is removed after the layer is drawn", () => {
  const { layer } = start({ on: true, line: "upright", share: 25 });
  const canvas = {
    save: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    restore: vi.fn(),
  };
  const context = canvas as unknown as CanvasRenderingContext2D;
  // A canvas that holds two pixels for each pixel of the page.
  const transform = [2, 0, 0, 2, 0, 0];
  layer.dispatchEvent(new RenderEvent("prerender", transform, undefined, context));
  expect(canvas.moveTo).toHaveBeenCalledWith(0, 0);
  expect(canvas.lineTo.mock.calls).toEqual([
    [0, 1200],
    [400, 1200],
    [400, 0],
  ]);
  expect(canvas.clip).toHaveBeenCalledTimes(1);
  layer.dispatchEvent(new RenderEvent("postrender", transform, undefined, context));
  expect(canvas.restore).toHaveBeenCalledTimes(1);
});
