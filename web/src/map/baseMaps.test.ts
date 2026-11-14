import type ImageTile from "ol/ImageTile";
import { get as getProjection } from "ol/proj";
import { expect, test } from "vitest";
import { BASE_MAPS, baseMapStore } from "./baseMaps";

test("every background map asks for its images with the crossOrigin attribute", () => {
  const projection = getProjection("EPSG:3857");
  if (!projection) {
    throw new Error("the projection of the map is not known");
  }
  for (const { createSource } of BASE_MAPS) {
    const tile = createSource().getTile(0, 0, 0, 1, projection) as ImageTile;
    expect((tile.getImage() as HTMLImageElement).crossOrigin).toBe("anonymous");
  }
});

test("the page starts with the Blue Marble as the background map", () => {
  expect(baseMapStore.get()).toBe("blue-marble");
});
