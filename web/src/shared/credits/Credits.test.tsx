// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import TileLayer from "ol/layer/Tile";
import OlMap from "ol/Map";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import View from "ol/View";
import { expect, test } from "vitest";
import { MapContext } from "../map";
import { Credits } from "./Credits";

/** Show the credits of both places for a map with a layer of OpenStreetMap and a layer of another service. */
function setUp() {
  const streets = new TileLayer({ source: new OSM() });
  const imagery = new TileLayer({
    source: new XYZ({
      url: "/tiles/{z}/{x}/{y}.png",
      attributions: 'Imagery: <a href="https://example.org/imagery">Service</a>',
    }),
  });
  const map = new OlMap({ layers: [imagery, streets], view: new View({ center: [0, 0], zoom: 2 }), controls: [] });
  const { container } = render(
    <MapContext value={map}>
      <Credits place="map" />
      <Credits place="beside" />
    </MapContext>,
  );
  /** The text of the credits of a place, or null when the place is not drawn. */
  const text = (place: string) => container.querySelector(`.credits--${place}`)?.textContent ?? null;
  return { map, streets, imagery, text };
}

test("each place shows its own credits, with the links of the sources", () => {
  const { text } = setUp();
  expect(text("map")).toBe("\u00a9 OpenStreetMap contributors.");
  expect(text("beside")).toBe("Imagery: Service");
  const links = screen.getAllByRole<HTMLAnchorElement>("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["OpenStreetMap", "https://www.openstreetmap.org/copyright"],
    ["Service", "https://example.org/imagery"],
  ]);
  for (const link of links) {
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  }
});

test("a place without a credit is not drawn, and is drawn again when a layer with a credit is shown", () => {
  const { map, streets, imagery, text } = setUp();
  act(() => {
    streets.setVisible(false);
    imagery.setVisible(false);
    map.dispatchEvent("postrender");
  });
  expect(text("map")).toBeNull();
  expect(text("beside")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  act(() => {
    streets.setVisible(true);
    map.dispatchEvent("postrender");
  });
  expect(text("map")).toBe("\u00a9 OpenStreetMap contributors.");
  expect(text("beside")).toBeNull();
});

test("the credit follows the source when the source changes its credit", () => {
  const { map, imagery, text } = setUp();
  act(() => {
    imagery.getSource()?.setAttributions("Image of 2026-11-13");
    map.dispatchEvent("postrender");
  });
  expect(text("beside")).toBe("Image of 2026-11-13");
});

test("two credits of one place stand in elements of their own", () => {
  const { map, text } = setUp();
  act(() => {
    map.addLayer(new TileLayer({ source: new XYZ({ url: "/other/{z}/{x}/{y}.png", attributions: "Survey" }) }));
    map.dispatchEvent("postrender");
  });
  expect(text("beside")).toBe("Imagery: Service Survey");
  expect(screen.getByText("Survey").className).toBe("credit");
});
