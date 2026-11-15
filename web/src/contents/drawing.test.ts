import OlMap from "ol/Map";
import View from "ol/View";
import WebGLTileLayer from "ol/layer/WebGLTile";
import { beforeEach, expect, test, vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { messagesStore } from "../shared/messages/messages";
import { FIRST_Z_INDEX } from "../shared/shapeLayers";
import { CogSource } from "./CogSource";
import { extentOf, findLayer } from "./display";
import { drawAgain, drawAgainStore, LayerDrawing, layerProblemsStore } from "./drawing";
import type { LayerProblem } from "./fileProblem";
import { firstDisplay } from "./state";
import { openTestFile } from "./testdata/files";

const BACKSCATTER: LayerDescription = {
  id: "backscatter",
  title: "Backscatter HH",
  kind: "layer",
  url: "/files/backscatter/backscatter.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  unit: "1",
  range: [0.01, 0.4],
  colours: "grey",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L2_PR_GCOV"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/backscatter/backscatter.json",
};

const COHERENCE: LayerDescription = {
  ...BACKSCATTER,
  id: "coherence",
  title: "Coherence HH, 20 m",
  url: "/files/coherence/coherence.tif",
  quantity: "Interferometric coherence magnitude, HH",
  range: [0, 1],
  dates: ["2026-10-09", "2026-10-21"],
};

/** Open the test file that an address names. */
const open = (url: string) => openTestFile(url.includes("coherence") ? "coherence" : "backscatter");

function start(): { map: OlMap; drawing: LayerDrawing } {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  return { map, drawing: new LayerDrawing(map, open, false) };
}

function layerOf(map: OlMap, id: string): WebGLTileLayer {
  const layer = findLayer(map, id);
  if (!(layer instanceof WebGLTileLayer)) {
    throw new Error(`the map has no layer ${id}`);
  }
  return layer;
}

beforeEach(() => {
  layerProblemsStore.set({});
  drawAgainStore.set({});
  messagesStore.set([]);
});

test("every layer of the pane has one layer on the map, which carries its id and its place in the drawing order", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE, BACKSCATTER], {});
  expect(map.getAllLayers().map((layer): unknown => layer.get("id"))).toEqual(["coherence", "backscatter"]);
  expect(layerOf(map, "coherence").getZIndex()).toBe(FIRST_Z_INDEX);
  expect(layerOf(map, "backscatter").getZIndex()).toBe(FIRST_Z_INDEX + 1);
  expect(layerOf(map, "backscatter").getSource()).toBeInstanceOf(CogSource);
});

test("a new order changes the places and keeps the layers", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE, BACKSCATTER], {});
  const coherence = layerOf(map, "coherence");
  drawing.update([BACKSCATTER, COHERENCE], {});
  expect(layerOf(map, "coherence")).toBe(coherence);
  expect(coherence.getZIndex()).toBe(FIRST_Z_INDEX + 1);
  expect(layerOf(map, "backscatter").getZIndex()).toBe(FIRST_Z_INDEX);
});

test("a layer is drawn at its place in the drawing order of all the layers, which holds the shape layers too", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE, BACKSCATTER], {}, ["coherence", "area", "backscatter"]);
  expect(layerOf(map, "coherence").getZIndex()).toBe(FIRST_Z_INDEX);
  expect(layerOf(map, "backscatter").getZIndex()).toBe(FIRST_Z_INDEX + 2);
  // The shape layer moves to the bottom: the two layers keep their order and are drawn one place higher or as before.
  drawing.update([COHERENCE, BACKSCATTER], {}, ["area", "coherence", "backscatter"]);
  expect(layerOf(map, "coherence").getZIndex()).toBe(FIRST_Z_INDEX + 1);
  expect(layerOf(map, "backscatter").getZIndex()).toBe(FIRST_Z_INDEX + 2);
  drawing.update([COHERENCE, BACKSCATTER], {}, ["coherence", "backscatter", "area", "products"]);
  expect(layerOf(map, "coherence").getZIndex()).toBe(FIRST_Z_INDEX);
  expect(layerOf(map, "backscatter").getZIndex()).toBe(FIRST_Z_INDEX + 1);
});

test("a layer that the drawing order does not name is drawn above the layers that it names", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE, BACKSCATTER], {}, ["area", "coherence"]);
  expect(layerOf(map, "coherence").getZIndex()).toBe(FIRST_Z_INDEX + 1);
  expect(layerOf(map, "backscatter").getZIndex()).toBe(FIRST_Z_INDEX + 3);
});

test("a layer that leaves the pane leaves the map", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE, BACKSCATTER], {});
  drawing.update([BACKSCATTER], {});
  expect(findLayer(map, "coherence")).toBeUndefined();
  drawing.clear();
  expect(map.getAllLayers()).toHaveLength(0);
});

test("the layer follows its display: shown or hidden, opacity and value range", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE], {});
  const layer = layerOf(map, "coherence");
  const variables = vi.spyOn(layer, "updateStyleVariables");
  expect(layer.getVisible()).toBe(true);
  expect(layer.getOpacity()).toBe(1);
  drawing.update([COHERENCE], { coherence: { visible: false, opacity: 0.4, range: [0.2, 0.9], colours: "grey" } });
  expect(layer.getVisible()).toBe(false);
  expect(layer.getOpacity()).toBe(0.4);
  expect(variables).toHaveBeenLastCalledWith({ lowest: 0.2, highest: 0.9, maskLowest: -3e38, maskHighest: 3e38 });
  drawing.update([COHERENCE], { coherence: { ...firstDisplay(COHERENCE), mask: [0.3, 1] } });
  expect(variables).toHaveBeenLastCalledWith({ lowest: 0, highest: 1, maskLowest: 0.3, maskHighest: 1 });
});

test("another colour scale gives the layer another style and keeps its source", () => {
  const { map, drawing } = start();
  drawing.update([COHERENCE], {});
  const layer = layerOf(map, "coherence");
  const source = layer.getSource();
  const style = vi.spyOn(layer, "setStyle");
  drawing.update([COHERENCE], { coherence: { ...firstDisplay(COHERENCE), colours: "viridis" } });
  expect(style).toHaveBeenCalledTimes(1);
  expect(layer.getSource()).toBe(source);
  drawing.update([COHERENCE], { coherence: { ...firstDisplay(COHERENCE), colours: "viridis", opacity: 0.5 } });
  expect(style).toHaveBeenCalledTimes(1);
  drawing.update([COHERENCE], { coherence: { ...firstDisplay(COHERENCE), colours: "viridis", inverted: true } });
  expect(style).toHaveBeenCalledTimes(2);
  drawing.update([COHERENCE], {
    coherence: { ...firstDisplay(COHERENCE), colours: "viridis", noDataColour: "#ff0000" },
  });
  expect(style).toHaveBeenCalledTimes(3);
});

test("a power is drawn in decibels, and on the linear scale when its display says so", () => {
  const { map, drawing } = start();
  drawing.update([BACKSCATTER], {});
  const layer = layerOf(map, "backscatter");
  const variables = vi.spyOn(layer, "updateStyleVariables");
  expect((layer.getSource() as CogSource).bandCount).toBe(3);
  drawing.update([BACKSCATTER], {});
  const [range] = variables.mock.lastCall ?? [];
  expect(range?.lowest).toBeCloseTo(-20, 10);
  expect(range?.highest).toBeCloseTo(-3.979400086720376, 10);
  drawing.update([BACKSCATTER], { backscatter: { ...firstDisplay(BACKSCATTER), decibels: false } });
  expect((layer.getSource() as CogSource).bandCount).toBe(2);
  expect(variables.mock.lastCall?.[0]).toMatchObject({ lowest: 0.01, highest: 0.4 });
});

test("the extent of a layer is the extent of its file, in the projection of the view", async () => {
  const { map, drawing } = start();
  drawing.update([BACKSCATTER], {});
  const extent = await extentOf(map, "backscatter");
  // The rectangle around the four corners of testdata/backscatter.json in EPSG:3857, as PROJ 9.8.1 computes them.
  // The grid of the file is turned a little against the Web Mercator map, so each limit comes from another corner.
  const expected = [-7923838.2577, 5303104.9812, -7922059.0465, 5304464.0206];
  expect(extent).toHaveLength(4);
  extent?.forEach((limit, index) => expect(Math.abs(limit - (expected[index] ?? Number.NaN))).toBeLessThan(0.01));
});

test("a file that cannot be read is reported once, and the problem leaves with the layer", async () => {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  const explain = vi.fn((): Promise<LayerProblem | null> => Promise.resolve(null));
  const drawing = new LayerDrawing(map, () => Promise.reject(new Error("404")), false, explain);
  drawing.update([COHERENCE], {});
  await vi.waitFor(() => expect(layerProblemsStore.get()).toHaveProperty("coherence"));
  expect(explain.mock.calls).toEqual([["/files/coherence/coherence.tif"]]);
  expect(layerProblemsStore.get().coherence).toEqual({ text: "The file of the layer could not be read.", again: true });
  expect(messagesStore.get().map(({ kind, text }) => ({ kind, text }))).toEqual([
    { kind: "error", text: "Coherence HH, 20 m: The file of the layer could not be read." },
  ]);
  expect(await extentOf(map, "coherence")).toBeNull();
  drawing.update([], {});
  expect(layerProblemsStore.get()).toEqual({});
});

const OWN: LayerDescription = {
  ...COHERENCE,
  id: "own",
  url: "/api/servers/3f9a1c0b7e24d658/files/fedcba9876543210fedcba9876543210/coherence.tif",
  record: "/api/servers/3f9a1c0b7e24d658/files/fedcba9876543210fedcba9876543210/coherence.json",
};
const AWAY: LayerProblem = {
  text: "Your own server, which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again.",
  again: true,
};

test("a layer of an own server is read from the address of its description, as a layer of the project server is", async () => {
  const opened: string[] = [];
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  const drawing = new LayerDrawing(
    map,
    (url) => {
      opened.push(url);
      return open(url);
    },
    false,
  );
  drawing.update([OWN, BACKSCATTER], {});
  expect(opened).toEqual([OWN.url, BACKSCATTER.url]);
  expect(await extentOf(map, "own")).toHaveLength(4);
  expect(layerProblemsStore.get()).toEqual({});
});

test("a layer whose server is not connected states it in one sentence in place of an empty layer", async () => {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  const explain = vi.fn((): Promise<LayerProblem | null> => Promise.resolve(AWAY));
  const drawing = new LayerDrawing(map, () => Promise.reject(new Error("Error fetching data.")), false, explain);
  drawing.update([OWN], {});
  await vi.waitFor(() => expect(layerProblemsStore.get()).toEqual({ own: AWAY }));
  expect(explain.mock.calls).toEqual([[OWN.url]]);
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["error", `Coherence HH, 20 m: ${AWAY.text}`],
  ]);
});

test("a file that Lynkeus cannot draw says why itself, and the site is not asked", async () => {
  const { CogError } = await import("./cog");
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  const explain = vi.fn((): Promise<LayerProblem | null> => Promise.resolve(AWAY));
  const refuse = () => Promise.reject(new CogError("The file of the layer holds more than one band."));
  const drawing = new LayerDrawing(map, refuse, false, explain);
  drawing.update([COHERENCE], {});
  await vi.waitFor(() => expect(layerProblemsStore.get()).toHaveProperty("coherence"));
  expect(layerProblemsStore.get().coherence).toEqual({
    text: "The file of the layer holds more than one band.",
    again: false,
  });
  expect(explain).not.toHaveBeenCalled();
});

test("a tile that does not arrive asks the site once, and a server that is not connected is stated", async () => {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  const explained: ((problem: LayerProblem | null) => void)[] = [];
  const explain = vi.fn(() => new Promise<LayerProblem | null>((resolve) => explained.push(resolve)));
  const drawing = new LayerDrawing(map, open, false, explain);
  drawing.update([OWN], {});
  const source = layerOf(map, "own").getSource();
  await vi.waitFor(() => expect(source?.getState()).toBe("ready"));
  const fail = () => source?.dispatchEvent("tileloaderror");
  fail();
  fail();
  expect(explain).toHaveBeenCalledTimes(1);
  // The file can still be read: nothing is stated, and the next failure asks again.
  explained[0]?.(null);
  await vi.waitFor(() => {
    fail();
    expect(explain).toHaveBeenCalledTimes(2);
  });
  expect(layerProblemsStore.get()).toEqual({});
  explained[1]?.(AWAY);
  await vi.waitFor(() => expect(layerProblemsStore.get()).toEqual({ own: AWAY }));
  fail();
  expect(explain).toHaveBeenCalledTimes(2);
});

test("the file of a layer is opened anew when the visitor asks to draw the layer again", async () => {
  let connected = false;
  const opened: string[] = [];
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  const drawing = new LayerDrawing(
    map,
    (url) => {
      opened.push(url);
      return connected ? open(url) : Promise.reject(new Error("Error fetching data."));
    },
    false,
    () => Promise.resolve(AWAY),
  );
  drawing.update([OWN], {});
  await vi.waitFor(() => expect(layerProblemsStore.get()).toEqual({ own: AWAY }));
  const first = layerOf(map, "own");
  drawing.update([OWN], {}, undefined, drawAgainStore.get());
  expect(layerOf(map, "own")).toBe(first);
  connected = true;
  drawAgain("own");
  expect(drawAgainStore.get()).toEqual({ own: 1 });
  drawing.update([OWN], {}, undefined, drawAgainStore.get());
  expect(opened).toEqual([OWN.url, OWN.url]);
  expect(layerOf(map, "own")).not.toBe(first);
  expect(layerProblemsStore.get()).toEqual({});
  expect(await extentOf(map, "own")).toHaveLength(4);
});
