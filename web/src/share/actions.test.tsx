import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { selectedLayerStore } from "../contents/state";
import { areaStore } from "../shared/area";
import { dockStore, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { useShareActions } from "./actions";
import { saveFile } from "./download";
import { saveAddress } from "./layerFile";
import { forgetDataSources } from "./layerSources";
import received from "./testdata/record-gcov-20261021.json";

vi.mock("./download", async (original) => ({ ...(await original<typeof import("./download")>()), saveFile: vi.fn() }));
vi.mock("./layerFile", async (original) => ({
  ...(await original<typeof import("./layerFile")>()),
  saveAddress: vi.fn(),
}));

const BACKSCATTER: LayerDescription = {
  id: "gcov-hhhh-20261021",
  title: "Backscatter HH, 21 Oct 2026",
  kind: "layer",
  url: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  unit: "1",
  range: [0, 0.5],
  colours: "grey",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json",
};

function messages(): string[][] {
  return messagesStore.get().map(({ kind, text }) => [kind, text]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  // A test that reads a record gives the answer of the server itself; no test sends a request.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No record is given in this test.")));
  resetDock();
  forgetDataSources();
  messagesStore.set([]);
  areaStore.set(null);
  mapLayersStore.set([]);
  selectedLayerStore.set(null);
});

test("the Area button saves the area as a GeoJSON file and reports it", async () => {
  areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  renderHook(() => useShareActions()).result.current["export-area"]?.run();
  const [content, name] = vi.mocked(saveFile).mock.calls[0] ?? [];
  expect(name).toBe("lynkeus-area.geojson");
  expect(content?.type).toBe("application/geo+json");
  expect(JSON.parse((await content?.text()) ?? "null")).toMatchObject({
    type: "FeatureCollection",
    bbox: [-71.2, 42.6, -70.75, 42.95],
  });
  expect(messages()).toEqual([["success", "The area was saved as lynkeus-area.geojson."]]);
});

test("without an area the Area button saves nothing and tells the user to set one", () => {
  renderHook(() => useShareActions()).result.current["export-area"]?.run();
  expect(saveFile).not.toHaveBeenCalled();
  expect(messages()).toEqual([["warning", "No area is set. Set an area in the Map tab, then save it."]]);
});

test("the Layer button saves the file of the selected layer under a name of its title and dates", () => {
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  renderHook(() => useShareActions()).result.current["export-layer"]?.run();
  expect(saveAddress).toHaveBeenCalledWith(
    new URL("/files/gcov-hhhh-20261021/gcov-hhhh-20261021.tif", window.location.href).href,
    "backscatter-hh-20261021.tif",
  );
  expect(messages()).toEqual([["success", "The browser saves the file of the layer as backscatter-hh-20261021.tif."]]);
});

test("without a selected layer the Layer button saves nothing and tells the user to select one", () => {
  mapLayersStore.set([BACKSCATTER]);
  renderHook(() => useShareActions()).result.current["export-layer"]?.run();
  expect(saveAddress).not.toHaveBeenCalled();
  expect(messages()).toEqual([["warning", "No layer is selected. Select a layer in the Contents pane first."]]);
});

test("a file of a layer that is not on this site is not saved", () => {
  mapLayersStore.set([{ ...BACKSCATTER, url: "https://example.org/layer.tif" }]);
  selectedLayerStore.set(BACKSCATTER.id);
  renderHook(() => useShareActions()).result.current["export-layer"]?.run();
  expect(saveAddress).not.toHaveBeenCalled();
  expect(messages()).toEqual([["error", "The file of the layer is not on this site, so it was not saved."]]);
});

test.each(["export-map-image", "export-record", "print-layout", "link-to-map"] as const)(
  "the button %s opens the tool pane of its name",
  (id) => {
    renderHook(() => useShareActions()).result.current[id]?.run();
    expect(dockStore.get().tools).toEqual([id]);
  },
);

test("the Citation button has no action without a selected layer", () => {
  const actions = renderHook(() => useShareActions()).result.current;
  expect(actions.citation).toBeUndefined();
});

test("the Citation button has an action when the record of the selected layer names a DOI", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) }));
  mapLayersStore.set([BACKSCATTER]);
  const { result } = renderHook(() => useShareActions());
  act(() => selectedLayerStore.set(BACKSCATTER.id));
  await waitFor(() => expect(result.current.citation).toBeDefined());
  act(() => result.current.citation?.run());
  expect(dockStore.get().tools).toEqual(["citation"]);
  act(() => selectedLayerStore.set(null));
  expect(result.current.citation).toBeUndefined();
});

test("the Citation button has no action when the record names no DOI or cannot be read", async () => {
  const withoutDoi = { ...received, properties: { ...received.properties, "sci:doi": undefined } };
  const fetched = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(withoutDoi) });
  vi.stubGlobal("fetch", fetched);
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  const { result } = renderHook(() => useShareActions());
  await waitFor(() => expect(fetched).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.citation).toBeUndefined();
});
