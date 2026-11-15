// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useMemo, useState } from "react";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import VectorLayer from "ol/layer/Vector";
import { transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Stroke, Style } from "ol/style";
import { drawShape } from "../shared/drawShape";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import {
  dropShapeLayer,
  putShapeLayer,
  setShapeDisplay,
  shapeDisplayOf,
  type ShapeLayer,
  type ShapeSymbol,
} from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { useShapeLayer } from "../shared/useShapeLayer";
import type { SearchDraft } from "./search";
import {
  areaGeometry,
  areaKind,
  areaProperties,
  fitRings,
  rectangleOfExtent,
  ringsOfGeometry,
  sameArea,
  type SearchArea,
} from "./searchArea";
import { drawingStore, searchDraftStore } from "./state";

/** The id of the shape layer of the area of the search. The layer of the map carries it. */
export const SEARCH_AREA_LAYER_ID = "search-area";

/**
 * How the map draws the area of the search, which is also its symbol in the legend of the layer: a broken line
 * in the secondary colour of the U.S. Web Design System, so that it differs from the outlines of the products.
 */
export const SEARCH_AREA_SYMBOL = {
  label: "Area of the search",
  line: "#d83933",
  width: 2,
  dash: [6, 4],
} satisfies ShapeSymbol;

const AREA_STYLE = new Style({
  stroke: new Stroke({
    color: SEARCH_AREA_SYMBOL.line,
    width: SEARCH_AREA_SYMBOL.width,
    lineDash: SEARCH_AREA_SYMBOL.dash,
  }),
});

/** Return the area that the form holds, when it is one that can be drawn on the map. */
export function areaOfDraft(draft: SearchDraft | null): SearchArea | null {
  if (!draft || draft.by !== "properties" || !draft.limited) {
    return null;
  }
  if (draft.area.kind === "polygons") {
    return draft.area.rings.length > 0 ? draft.area : null;
  }
  const sides = [draft.area.west, draft.area.south, draft.area.east, draft.area.north];
  const [west, south, east, north] = sides.map((side) => (side.trim() === "" ? Number.NaN : Number(side)));
  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    return null;
  }
  const inside = Math.abs(west) <= 180 && Math.abs(east) <= 180 && Math.abs(south) <= 90 && Math.abs(north) <= 90;
  return inside && west !== east && south < north ? { kind: "rectangle", west, south, east, north } : null;
}

/** Put a drawn shape in the form as the area of the search. Return what is wrong with the shape, or null. */
export function takeDrawnShape(shape: Geometry, kind: "rectangle" | "polygon", projection: string): string | null {
  const draft = searchDraftStore.get();
  if (!draft) {
    return null;
  }
  if (kind === "rectangle") {
    const { west, south, east, north } = rectangleOfExtent(transformExtent(shape.getExtent(), projection, "EPSG:4326"));
    if (west === east || south >= north) {
      return "The rectangle has no area. Press, move the pointer and release.";
    }
    const area = { kind, west: String(west), south: String(south), east: String(east), north: String(north) } as const;
    searchDraftStore.set({ ...draft, limited: true, area });
    return null;
  }
  const rings = fitRings(ringsOfGeometry(shape, projection));
  if (!rings || rings.length === 0) {
    return "The polygon has too many points for a search. Draw it with fewer points.";
  }
  searchDraftStore.set({ ...draft, limited: true, area: { kind: "polygons", rings } });
  return null;
}

/** Take the area out of the search, so that the form shows "Whole Earth". The sides of the area stay in the form. */
function removeArea(): void {
  const draft = searchDraftStore.get();
  if (draft) {
    searchDraftStore.set({ ...draft, limited: false });
  }
}

/**
 * The area of the search on the map. It is one layer of the Contents pane, "Area of the search", whenever the
 * form of the search holds an area that can be drawn: the pane shows and hides the layer, moves it in the
 * drawing order and removes it, which takes the area out of the search. The area therefore stays on the map
 * when the search pane and the pane of Get layer, which takes the same area, close. An area that has just been
 * set is shown even when the layer was hidden. The user draws the area as a rectangle, with a press, a move and
 * a release, or as a polygon, with one click for each point and a double click for the last; the Escape key
 * ends the drawing without a shape.
 */
export function SearchAreaLayer() {
  const map = useMap();
  const draft = useStore(searchDraftStore);
  const drawing = useStore(drawingStore);
  const [layer] = useState(
    () =>
      new VectorLayer({
        source: new VectorSource(),
        style: AREA_STYLE,
        properties: { id: SEARCH_AREA_LAYER_ID },
      }),
  );
  useShapeLayer(layer, SEARCH_AREA_LAYER_ID);

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  // The area is kept while the form changes in its other choices, so that the layer is described again only
  // when the area itself has changed.
  const drawn = areaOfDraft(draft);
  const [area, setArea] = useState(drawn);
  if (!sameArea(area, drawn)) {
    setArea(drawn);
  }

  useEffect(() => {
    const source = layer.getSource();
    source?.clear();
    if (area) {
      source?.addFeature(new Feature(areaGeometry(area, map.getView().getProjection())));
    }
  }, [map, layer, area]);

  const description = useMemo<ShapeLayer | null>(
    () =>
      area && {
        id: SEARCH_AREA_LAYER_ID,
        title: "Area of the search",
        line: areaKind(area),
        symbols: [SEARCH_AREA_SYMBOL],
        properties: areaProperties(area),
        remove: removeArea,
      },
    [area],
  );

  // An area that has just been set is shown, also when the user had hidden the layer of the area before it.
  useEffect(() => {
    if (description) {
      putShapeLayer(description);
      if (!shapeDisplayOf(SEARCH_AREA_LAYER_ID).visible) {
        setShapeDisplay(SEARCH_AREA_LAYER_ID, { visible: true });
      }
    } else {
      dropShapeLayer(SEARCH_AREA_LAYER_ID);
    }
  }, [description]);
  useEffect(() => () => dropShapeLayer(SEARCH_AREA_LAYER_ID), []);

  useEffect(() => {
    if (!drawing) {
      return;
    }
    return drawShape(
      map,
      drawing,
      SEARCH_AREA_SYMBOL.line,
      (shape) => {
        const fault = takeDrawnShape(shape, drawing, map.getView().getProjection().getCode());
        if (fault) {
          report("warning", fault);
        }
      },
      () => drawingStore.set(null),
    );
  }, [map, drawing]);

  return null;
}
