// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import type { FrameState } from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM, { ATTRIBUTION } from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { expect, test } from "vitest";
import { BASE_MAPS } from "../map/baseMaps";
import { attributionText, creditsOf } from "./credits";

/** The part of a frame of the map that the lines of sources are read from. */
function frameOf(map: OlMap): FrameState {
  const view = map.getView();
  return {
    layerStatesArray: map.getLayerGroup().getLayerStatesArray(),
    viewState: { resolution: view.getResolution(), zoom: view.getZoom() },
  } as unknown as FrameState;
}

function mapOf(layers: (TileLayer | VectorLayer)[]): OlMap {
  return new OlMap({ layers, view: new View({ center: [0, 0], zoom: 4 }) });
}

test("the attribution that OpenLayers gives for OpenStreetMap becomes text with the address of its link", () => {
  expect(attributionText(ATTRIBUTION)).toBe(
    "\u00a9 OpenStreetMap (https://www.openstreetmap.org/copyright) contributors.",
  );
});

test("a link whose text is its address is written once, and tags and repeated spaces are removed", () => {
  expect(attributionText('Data: <a href="https://example.org/">https://example.org/</a>')).toBe(
    "Data: https://example.org/",
  );
  expect(attributionText("<b>Survey</b>\n   of   2026 &amp; later")).toBe("Survey of 2026 & later");
});

test("each background map gives the line that its service asks for on a picture", () => {
  const layers = BASE_MAPS.map(
    ({ id, createSource }) => new TileLayer({ source: createSource(), properties: { id }, visible: false }),
  );
  const blueMarble = layers.find((layer) => layer.get("id") === "blue-marble");
  const openStreetMap = layers.find((layer) => layer.get("id") === "openstreetmap");
  if (!blueMarble || !openStreetMap) {
    throw new Error("The two background maps are missing.");
  }
  blueMarble.setVisible(true);
  const map = mapOf(layers);
  expect(creditsOf(frameOf(map))).toEqual([
    "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), " +
      "part of NASA's Earth Science Data and Information System (ESDIS).",
  ]);
  blueMarble.setVisible(false);
  openStreetMap.setVisible(true);
  expect(creditsOf(frameOf(map))).toEqual(["\u00a9 OpenStreetMap contributors, openstreetmap.org/copyright"]);
});

test("the imagery of a date gives its day and instrument, and then the acknowledgement of GIBS", () => {
  const imagery = new TileLayer({
    source: new XYZ({
      url: "/tiles/{z}/{x}/{y}.jpeg",
      attributions:
        'Image of 2026-11-13 (MODIS, Terra): <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS</a>',
    }),
    properties: { id: "imagery" },
  });
  expect(creditsOf(frameOf(mapOf([imagery])))).toEqual([
    "Image of 2026-11-13 (MODIS, Terra): NASA GIBS (https://nasa-gibs.github.io/gibs-api-docs/)",
    "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), " +
      "part of NASA's Earth Science Data and Information System (ESDIS).",
  ]);
});

test("another layer gives the attributions of its source, and a layer without any gives nothing", () => {
  const survey = new TileLayer({
    source: new XYZ({
      url: "/tiles/{z}/{x}/{y}.png",
      attributions: ['<a href="https://example.org/">Survey</a>', "Second"],
    }),
    zIndex: 100,
  });
  const sketch = new VectorLayer({ source: new VectorSource(), zIndex: 1000 });
  const background = new TileLayer({ source: new OSM(), properties: { id: "openstreetmap" }, zIndex: 0 });
  expect(creditsOf(frameOf(mapOf([sketch, survey, background])))).toEqual([
    "\u00a9 OpenStreetMap contributors, openstreetmap.org/copyright",
    "Survey (https://example.org/)",
    "Second",
  ]);
});

test("a hidden layer, a layer outside its zoom levels and a repeated line give nothing", () => {
  const hidden = new TileLayer({
    source: new XYZ({ url: "/a/{z}/{x}/{y}.png", attributions: "Hidden" }),
    visible: false,
  });
  const far = new TileLayer({ source: new XYZ({ url: "/b/{z}/{x}/{y}.png", attributions: "Far" }), minZoom: 10 });
  const first = new TileLayer({ source: new XYZ({ url: "/c/{z}/{x}/{y}.png", attributions: "Same" }) });
  const second = new TileLayer({ source: new XYZ({ url: "/d/{z}/{x}/{y}.png", attributions: "Same" }) });
  expect(creditsOf(frameOf(mapOf([hidden, far, first, second])))).toEqual(["Same"]);
});
