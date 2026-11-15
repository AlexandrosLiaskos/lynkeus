// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import TileLayer from "ol/layer/Tile";
import OlMap from "ol/Map";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import View from "ol/View";
import { beforeEach, expect, test } from "vitest";
import { MapContext } from "../shared/map";
import { statusBarStore } from "./state";
import { StatusBar } from "./StatusBar";

beforeEach(() => {
  statusBarStore.set(true);
});

/** Show the status bar of a map with the given layers. */
function setUp(...layers: TileLayer[]) {
  const map = new OlMap({ layers, view: new View({ center: [0, 0], zoom: 2 }), controls: [] });
  render(
    <MapContext value={map}>
      <StatusBar />
    </MapContext>,
  );
  return { map, bar: screen.getByRole("region", { name: "Status bar" }) };
}

function imagery(): TileLayer {
  return new TileLayer({
    source: new XYZ({
      url: "/tiles/{z}/{x}/{y}.jpeg",
      attributions: 'Imagery: <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS</a>',
    }),
  });
}

test("the credit of the background map stands at the right end of the status bar, with its link", () => {
  const { bar } = setUp(imagery());
  expect(bar.lastElementChild?.className).toBe("credits credits--beside");
  expect(bar.lastElementChild?.textContent).toBe("Imagery: NASA GIBS");
  expect(screen.getByRole("link", { name: "NASA GIBS" }).getAttribute("href")).toBe(
    "https://nasa-gibs.github.io/gibs-api-docs/",
  );
});

test("the status bar shows no credit for a map without one, nor the credit that stands on the map itself", () => {
  const { map, bar } = setUp(new TileLayer({ source: new OSM() }));
  expect(bar.querySelector(".credits")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  const layer = imagery();
  act(() => {
    map.addLayer(layer);
    map.dispatchEvent("postrender");
  });
  expect(bar.querySelector(".credits")?.textContent).toBe("Imagery: NASA GIBS");
  act(() => {
    layer.setVisible(false);
    map.dispatchEvent("postrender");
  });
  expect(bar.querySelector(".credits")).toBeNull();
});
