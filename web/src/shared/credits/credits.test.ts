import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import OlMap from "ol/Map";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import View from "ol/View";
import { expect, test, vi } from "vitest";
import { creditParts, creditsOf, watchCredits } from "./credits";

const OPENSTREETMAP =
  '&#169; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors.';

/** Make a layer of tiles whose source gives a credit. */
function layer(attributions: string | string[] | undefined, options: { visible?: boolean; minZoom?: number } = {}) {
  return new TileLayer({ source: new XYZ({ url: "/tiles/{z}/{x}/{y}.png", attributions }), ...options });
}

function mapOf(...layers: (TileLayer | LayerGroup)[]): OlMap {
  return new OlMap({ layers, view: new View({ center: [0, 0], zoom: 2 }), controls: [] });
}

test("a layer gives the credit of its source, which stands beside the map", () => {
  const map = mapOf(layer('Imagery: <a href="https://example.org/">Service</a>'));
  expect(creditsOf(map)).toEqual([{ html: 'Imagery: <a href="https://example.org/">Service</a>', place: "beside" }]);
});

test("the credit of a layer of OpenStreetMap stands on the map itself", () => {
  const map = mapOf(new TileLayer({ source: new OSM() }), layer("Survey"));
  expect(creditsOf(map)).toEqual([
    { html: OPENSTREETMAP, place: "map" },
    { html: "Survey", place: "beside" },
  ]);
});

test("a layer that is hidden, or outside its range of zoom levels, gives no credit", () => {
  const hidden = layer("Hidden", { visible: false });
  const far = layer("Far", { minZoom: 10 });
  const map = mapOf(hidden, far, layer(undefined));
  expect(creditsOf(map)).toEqual([]);
  hidden.setVisible(true);
  map.getView().setZoom(11);
  expect(creditsOf(map).map(({ html }) => html)).toEqual(["Hidden", "Far"]);
});

test("a layer inside a hidden group gives no credit", () => {
  const group = new LayerGroup({ layers: [layer("Inside")], visible: false });
  const map = mapOf(group);
  expect(creditsOf(map)).toEqual([]);
  group.setVisible(true);
  expect(creditsOf(map).map(({ html }) => html)).toEqual(["Inside"]);
});

test("a source gives each of its credits, and a credit that two layers share is listed once", () => {
  const map = mapOf(layer(["First", "Second"]), layer("First"));
  expect(creditsOf(map).map(({ html }) => html)).toEqual(["First", "Second"]);
});

test("a map whose view has no centre gives no credit", () => {
  const map = new OlMap({ layers: [layer("Survey")], view: new View(), controls: [] });
  expect(creditsOf(map)).toEqual([]);
});

test("a credit is divided into its texts and its links", () => {
  expect(creditParts(OPENSTREETMAP)).toEqual([
    "\u00a9 ",
    { text: "OpenStreetMap", address: "https://www.openstreetmap.org/copyright" },
    " contributors.",
  ]);
  expect(creditParts("Survey of 2026")).toEqual(["Survey of 2026"]);
  expect(creditParts("")).toEqual([]);
});

test("a link becomes a text when its address does not start with https, and other markup becomes its text", () => {
  expect(creditParts('<a href="javascript:alert(1)">Press</a> <a href="http://example.org/">Old</a>')).toEqual([
    "Press",
    " ",
    "Old",
  ]);
  expect(creditParts('<b>Bold <a href="https://example.org/">link</a></b><img src="x" onerror="alert(1)">')).toEqual([
    "Bold link",
  ]);
});

test("the listener receives the credits at once, and again only when a drawing of the map finds them changed", () => {
  const background = layer("Background");
  const map = mapOf(background);
  const listener = vi.fn();
  const end = watchCredits(map, listener);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenLastCalledWith([{ html: "Background", place: "beside" }]);

  map.dispatchEvent("postrender");
  expect(listener).toHaveBeenCalledTimes(1);

  background.getSource()?.setAttributions("Background of another day");
  map.dispatchEvent("postrender");
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenLastCalledWith([{ html: "Background of another day", place: "beside" }]);

  background.setVisible(false);
  map.dispatchEvent("postrender");
  expect(listener).toHaveBeenLastCalledWith([]);

  end();
  background.setVisible(true);
  map.dispatchEvent("postrender");
  expect(listener).toHaveBeenCalledTimes(3);
});
