import { act, renderHook } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import type { Pixel } from "ol/pixel";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { valueAt } from "../contents/display";
import { centrePixel, formatValue, useLayerValue, WIDEST_VALUE } from "./layerValue";

vi.mock("../contents/display", () => ({ valueAt: vi.fn() }));
const read = vi.mocked(valueAt);

beforeEach(() => {
  vi.useFakeTimers();
  read.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function createMap(): OlMap {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  map.setSize([800, 600]);
  return map;
}

/** Let the browser of the test draw one frame. */
function nextFrame(): void {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

test("a value is written with six significant figures", () => {
  // The number of 32 bits nearest to 0.0432156 is 0.043215598911046982.
  expect(formatValue(Math.fround(0.0432156))).toBe("0.0432156");
  expect(formatValue(-12.345678)).toBe("-12.3457");
  expect(formatValue(0.5)).toBe("0.5");
  expect(formatValue(0)).toBe("0");
  expect(formatValue(123456789)).toBe("123457000");
  expect(formatValue(-1.234567e-9)).toBe("-1.23457e-9");
  expect(formatValue(-8.88888e-88).length).toBe(WIDEST_VALUE.length);
});

test("the values of ten cells of the sample files are written as rasterio writes them with six figures", () => {
  // Five cells of gcov-hhhh-20261021.tif (linear power) and five of gunw-coherence-20261009-20261021.tif, read
  // with rasterio 1.5.2 (GDAL 3.12.2): the value with nine figures, which name one number of 32 bits, and the
  // same value in the format ".6g" of Python.
  const cells: readonly (readonly [number, string])[] = [
    [0.285015106, "0.285015"],
    [0.0283031464, "0.0283031"],
    [0.137012482, "0.137012"],
    [0.320137024, "0.320137"],
    [0.242183685, "0.242184"],
    [0.5982759, "0.598276"],
    [0.354227722, "0.354228"],
    [0.554631591, "0.554632"],
    [0.651606321, "0.651606"],
    [0.472384065, "0.472384"],
  ];
  for (const [value, written] of cells) {
    expect(formatValue(Math.fround(value))).toBe(written);
  }
});

test("the centre of the map is the middle of its size", () => {
  expect(centrePixel(createMap())).toEqual([400, 300]);
  expect(centrePixel(new OlMap({}))).toBeNull();
});

test("the value is read at the pixel of the pointer, once in a frame", () => {
  const map = createMap();
  read.mockReturnValue(0.25);
  const { result, rerender } = renderHook(({ pixel }: { pixel: Pixel | null }) => useLayerValue(map, "layer", pixel), {
    initialProps: { pixel: [10, 20] },
  });
  expect(result.current).toBeNull();
  expect(read).not.toHaveBeenCalled();
  // The pointer moves three times before the browser draws the next frame.
  rerender({ pixel: [11, 20] });
  rerender({ pixel: [12, 20] });
  rerender({ pixel: [13, 20] });
  nextFrame();
  expect(read).toHaveBeenCalledExactlyOnceWith(map, "layer", [13, 20]);
  expect(result.current).toBe(0.25);
});

test("without a pointer the value is read at the centre of the map", () => {
  const map = createMap();
  read.mockReturnValue(-3.5);
  const { result } = renderHook(() => useLayerValue(map, "layer", null));
  nextFrame();
  expect(read).toHaveBeenCalledExactlyOnceWith(map, "layer", [400, 300]);
  expect(result.current).toBe(-3.5);
});

test("the value is read again when the map has finished drawing", () => {
  const map = createMap();
  read.mockReturnValue(null);
  const { result } = renderHook(() => useLayerValue(map, "layer", null));
  nextFrame();
  expect(result.current).toBeNull();
  read.mockReturnValue(0.75);
  act(() => {
    map.dispatchEvent("rendercomplete");
  });
  nextFrame();
  expect(read).toHaveBeenCalledTimes(2);
  expect(result.current).toBe(0.75);
});

test("without a selected layer nothing is read", () => {
  const map = createMap();
  const { result } = renderHook(() => useLayerValue(map, null, [10, 20]));
  nextFrame();
  act(() => {
    map.dispatchEvent("rendercomplete");
  });
  nextFrame();
  expect(read).not.toHaveBeenCalled();
  expect(result.current).toBeNull();
});

test("the reading ends with the component", () => {
  const map = createMap();
  const { unmount } = renderHook(() => useLayerValue(map, "layer", [10, 20]));
  unmount();
  nextFrame();
  map.dispatchEvent("rendercomplete");
  nextFrame();
  expect(read).not.toHaveBeenCalled();
});
