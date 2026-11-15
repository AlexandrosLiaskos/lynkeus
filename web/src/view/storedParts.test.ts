// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import { expect, test } from "vitest";
import "../contents/storedLayers";
import "../data/storedSearch";
import "../map/bookmarks";
import { keepMapView } from "../map/storedView";
import "../shared/area";
import { storageStore } from "../shared/storage/storage";
import "./storedPanes";

test("the page declares six parts, each under its own name and with a description of one sentence", () => {
  const view = keepMapView(new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) }));
  const parts = storageStore.get().parts;
  expect(parts.map(({ title, key }) => [title, key])).toEqual([
    ["Area", "lynkeus.area"],
    ["Bookmarks", "lynkeus.bookmarks"],
    ["Layers of the map", "lynkeus.layers"],
    ["Map view", "lynkeus.view"],
    ["Panes", "lynkeus.panes"],
    ["Search form", "lynkeus.search"],
  ]);
  for (const { key, description, kept, bytes } of parts) {
    expect(description, key).toMatch(/^[A-Z][^.]*\.$/);
    expect(kept, key).toBe(true);
    expect(bytes, key).toBeNull();
  }
  view.leave();
});
