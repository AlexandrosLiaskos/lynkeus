import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { areaStore } from "../shared/area";
import { dockStore, resetDock } from "../shared/dock/dock";
import { messagesStore } from "../shared/messages/messages";
import { useShareActions } from "./actions";
import { saveFile } from "./download";

vi.mock("./download", async (original) => ({ ...(await original<typeof import("./download")>()), saveFile: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  resetDock();
  messagesStore.set([]);
  areaStore.set(null);
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
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["success", "The area was saved as lynkeus-area.geojson."],
  ]);
});

test("without an area the Area button saves nothing and tells the user to set one", () => {
  renderHook(() => useShareActions()).result.current["export-area"]?.run();
  expect(saveFile).not.toHaveBeenCalled();
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["warning", "No area is set. Set an area in the Map tab, then save it."],
  ]);
});

test.each(["export-map-image", "print-layout", "link-to-map"] as const)(
  "the button %s opens the tool pane of its name",
  (id) => {
    renderHook(() => useShareActions()).result.current[id]?.run();
    expect(dockStore.get().tools).toEqual([id]);
  },
);

test("the buttons of the functions that are not finished have no action", () => {
  const actions = renderHook(() => useShareActions()).result.current;
  expect(Object.keys(actions).sort()).toEqual(["export-area", "export-map-image", "link-to-map", "print-layout"]);
});
