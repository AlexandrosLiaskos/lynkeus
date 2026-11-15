// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useMemo, useState } from "react";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import { useMap } from "../shared/map";
import { dropShapeLayer, putShapeLayer, setShapeDisplay, type ShapeLayer } from "../shared/shapeLayers";
import { createStore, useStore } from "../shared/store";
import { useShapeLayer } from "../shared/useShapeLayer";
import {
  createFootprintLayer,
  footprintFeatures,
  isDrawing,
  nextSelection,
  OUTLINE_SYMBOL,
  outlinesExtent,
  PRODUCTS_LAYER_ID,
  productsAt,
  SELECTED_SYMBOL,
  showOutline,
  zoomTo,
  type FootprintLayer,
} from "./footprints";
import { formatCount, formatDay } from "./products";
import { describeSearch } from "./search";
import {
  hiddenProductsStore,
  hoveredProductStore,
  outlinesStore,
  productsStore,
  selectedProductStore,
  setProductVisible,
} from "./state";

/** The layer of the outlines, once the page holds it. The Catalog pane reads it to move the map to products. */
const layerStore = createStore<FootprintLayer | null>(null);

/** Move the map to the outline of one product, or to the outlines of every product found. */
export function zoomToProducts(map: OlMap, id?: string, duration?: number): void {
  const layer = layerStore.get();
  if (layer) {
    zoomTo(map, outlinesExtent(layer, id === undefined ? undefined : [id]), duration);
  }
}

/** Put the outlines of the products found on the map as a layer, if they were removed, and show the layer. */
export function showOutlines(): void {
  outlinesStore.set(true);
  setShapeDisplay(PRODUCTS_LAYER_ID, { visible: true });
}

/** State how many products the list holds, and how many the catalogue holds when it holds more. */
function countWords(listed: number, found: number): string {
  if (found > listed) {
    return `${formatCount(listed)} of ${formatCount(found)} products`;
  }
  return listed === 1 ? "1 product" : `${formatCount(listed)} products`;
}

/**
 * The outlines of the products found, on the map. They are one layer of the Contents pane, the group "Products
 * found", with one member for each product of the list: the pane shows and hides the layer or one outline,
 * moves the layer in the drawing order and removes it. The outlines therefore stay on the map when the search
 * pane closes, until the user hides or removes the layer; a removed layer leaves the list of the Catalog pane
 * as it is, and a new search or the button of that list puts the outlines back. The outline of the selected
 * product is drawn in the colour of the selection and the outline under the pointer is drawn stronger, and a
 * click on an outline selects its product.
 */
export function Footprints() {
  const map = useMap();
  const results = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const hovered = useStore(hoveredProductStore);
  const hidden = useStore(hiddenProductsStore);
  const onMap = useStore(outlinesStore);
  const [layer] = useState(createFootprintLayer);
  const { visible } = useShapeLayer(layer, PRODUCTS_LAYER_ID);

  useEffect(() => {
    layerStore.set(layer);
    return () => {
      layerStore.set(null);
    };
  }, [layer]);

  // The map holds the layer until the user removes it in the Contents pane.
  useEffect(() => {
    if (!onMap) {
      return;
    }
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer, onMap]);

  const products = results?.products;
  useEffect(() => {
    const source = layer.getSource();
    source?.clear();
    source?.addFeatures(footprintFeatures(products ?? [], map.getView().getProjection()));
  }, [map, layer, products]);

  // After a search the map moves to the products found, when it does not show them or shows them too small.
  const search = results?.search;
  useEffect(() => {
    if (search) {
      showOutline(map, outlinesExtent(layer));
    }
  }, [map, layer, search]);

  // The Contents pane lists the outlines while the list holds a product and the outlines are on the map. The
  // description is made again only when something that it states has changed.
  const items = useMemo(
    () =>
      (products ?? []).map(({ id, dates, track, frame, direction }) => ({
        id,
        title: dates.map(formatDay).join(" and "),
        line: `Track ${String(track)}, frame ${String(frame)}, ${direction}`,
      })),
    [products],
  );
  const found = results?.found ?? 0;
  const description = useMemo<ShapeLayer | null>(() => {
    if (!onMap || !search || items.length === 0) {
      return null;
    }
    return {
      id: PRODUCTS_LAYER_ID,
      title: "Products found",
      line: countWords(items.length, found),
      symbols: [OUTLINE_SYMBOL, SELECTED_SYMBOL],
      properties: [
        { name: "Kind", value: "Outlines of the products found" },
        { name: "Search", value: describeSearch(search).join(" ") },
        { name: "Products listed", value: formatCount(items.length) },
        { name: "Products in NASA's catalogue", value: formatCount(found) },
      ],
      remove: () => outlinesStore.set(false),
      members: {
        name: "Products",
        items,
        selected,
        hidden,
        select: (id) => selectedProductStore.set(id),
        setVisible: setProductVisible,
        zoomTo: (id) => zoomToProducts(map, id),
      },
    };
  }, [map, onMap, search, items, found, selected, hidden]);

  useEffect(() => {
    if (description) {
      putShapeLayer(description);
    } else {
      dropShapeLayer(PRODUCTS_LAYER_ID);
    }
  }, [description]);
  useEffect(() => () => dropShapeLayer(PRODUCTS_LAYER_ID), []);

  // The outline of the selected product is drawn in the colour of the selection, and the map moves to it when it
  // is out of view or too small.
  useEffect(() => {
    layer.set("selected", selected);
    layer.changed();
    const outline = selected ? layer.getSource()?.getFeatureById(selected)?.getGeometry()?.getExtent() : undefined;
    if (outline) {
      showOutline(map, outline);
    }
  }, [map, layer, selected]);

  useEffect(() => {
    layer.set("hovered", hovered);
    layer.changed();
  }, [layer, hovered]);

  useEffect(() => {
    layer.set("hidden", new Set(hidden));
    layer.changed();
  }, [layer, hidden]);

  // The pointer finds the outlines only while the layer is on the map and shown, and while no shape is being
  // drawn on the map.
  const pointing = onMap && visible;
  useEffect(() => {
    if (!pointing) {
      return;
    }
    const projection = map.getView().getProjection();
    const onMove = (event: MapBrowserEvent) => {
      const under = event.dragging || isDrawing(map) ? [] : productsAt(layer, event.coordinate, projection);
      const selectedNow = selectedProductStore.get();
      hoveredProductStore.set(selectedNow !== null && under.includes(selectedNow) ? selectedNow : (under[0] ?? null));
      map.getTargetElement()?.style.setProperty("cursor", under.length > 0 ? "pointer" : "");
    };
    const onClick = (event: MapBrowserEvent) => {
      if (isDrawing(map)) {
        return;
      }
      const under = productsAt(layer, event.coordinate, projection);
      if (under.length > 0) {
        selectedProductStore.set(nextSelection(under, selectedProductStore.get()));
      }
    };
    map.on("pointermove", onMove);
    map.on("singleclick", onClick);
    return () => {
      map.un("pointermove", onMove);
      map.un("singleclick", onClick);
      hoveredProductStore.set(null);
      map.getTargetElement()?.style.removeProperty("cursor");
    };
  }, [map, layer, pointing]);

  return null;
}
