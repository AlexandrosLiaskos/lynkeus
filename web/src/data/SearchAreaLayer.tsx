import { useEffect, useMemo, useState } from "react";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Draw, { createBox } from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import { transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Circle, Fill, Stroke, Style } from "ol/style";
import { dockStore } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import type { SearchDraft } from "./search";
import { areaGeometry, fitRings, rectangleOfExtent, ringsOfGeometry, type SearchArea } from "./searchArea";
import { drawingStore, GET_LAYER_PANE, SEARCH_PANE, searchDraftStore } from "./state";

// The area of the search is drawn as a broken line in the secondary colour of the U.S. Web Design System, so
// that it differs from the outlines of the products.
const AREA_STYLE = new Style({ stroke: new Stroke({ color: "#d83933", width: 2, lineDash: [6, 4] }) });
// While a shape is drawn, a dot marks the place of the pointer.
const SKETCH_STYLE = new Style({
  stroke: new Stroke({ color: "#d83933", width: 2, lineDash: [6, 4] }),
  image: new Circle({ radius: 4, fill: new Fill({ color: "#d83933" }) }),
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

/**
 * The area of the search on the map. It is shown while the search pane or the pane of Get layer, which takes the
 * same area, is open, and while the user draws it: a rectangle with a press, a move and a release, or a polygon
 * with one click for each point and a double click for the last. The Escape key ends the drawing without a shape.
 */
export function SearchAreaLayer() {
  const map = useMap();
  const open = useStore(dockStore).tools.some((tool) => tool === SEARCH_PANE || tool === GET_LAYER_PANE);
  const draft = useStore(searchDraftStore);
  const drawing = useStore(drawingStore);
  const [layer] = useState(() => new VectorLayer({ source: new VectorSource(), style: AREA_STYLE, zIndex: 1001 }));

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  const shown = open || drawing !== null;
  const area = useMemo(() => (shown ? areaOfDraft(draft) : null), [shown, draft]);
  useEffect(() => {
    const source = layer.getSource();
    source?.clear();
    if (area) {
      source?.addFeature(new Feature(areaGeometry(area, map.getView().getProjection())));
    }
  }, [map, layer, area]);

  useEffect(() => {
    if (!drawing) {
      return;
    }
    // A freehand drawing begins at the press and ends at the release, so the rectangle follows one drag.
    const draw =
      drawing === "rectangle"
        ? new Draw({ type: "Circle", geometryFunction: createBox(), freehand: true, style: SKETCH_STYLE })
        : new Draw({ type: "Polygon", style: SKETCH_STYLE });
    draw.on("drawend", (event) => {
      const shape = event.feature.getGeometry();
      const fault = shape ? takeDrawnShape(shape, drawing, map.getView().getProjection().getCode()) : null;
      if (fault) {
        report("warning", fault);
      }
      drawingStore.set(null);
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        drawingStore.set(null);
      }
    };
    map.addInteraction(draw);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      map.removeInteraction(draw);
    };
  }, [map, drawing]);

  return null;
}
