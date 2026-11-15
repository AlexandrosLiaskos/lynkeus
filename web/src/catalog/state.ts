// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { passFocus } from "../shared/dock/dock";
import { createStore } from "../shared/store";

/** The ids of the elements of the four sections of the Catalog pane. */
export const SECTIONS = {
  products: "catalog-products",
  jobs: "catalog-jobs",
  layers: "catalog-layers",
  series: "catalog-series",
} as const;

/** The id of the layer that is marked in the list of layers, or null. */
export const markedLayerStore = createStore<string | null>(null);

/** Whether the section "Layers" is open. */
export const layersOpenStore = createStore(true);

/** Open the section "Layers" and mark one layer of its list. The list brings the marked layer into view. */
export function showLayer(id: string): void {
  layersOpenStore.set(true);
  markedLayerStore.set(id);
}

/** Return the button of the title of a section, or null while the section is not on the page. */
export function titleOf(section: string): HTMLElement | null {
  return document.getElementById(section)?.querySelector<HTMLElement>(".section-toggle") ?? null;
}

/**
 * Give the keyboard focus to an element after the element that held the focus has left the page, as the row of
 * a removed job or layer does. When the element given has left the page as well, the focus goes to the map. The
 * focus stays where it is when the visitor has moved it meanwhile.
 */
export function keepFocus(target: () => HTMLElement | null): void {
  window.setTimeout(() => {
    if (document.activeElement === null || document.activeElement === document.body) {
      passFocus(target() ?? undefined);
    }
  });
}
