// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { showPane, sideOf, type PaneSide } from "./dock/dock";
import { createStore } from "./store";

export { sideOf, type PaneSide };

/** The two panes that every GIS program has: Contents on the left of the map and Catalog on the right. */
export type PaneId = "contents" | "catalog";

export interface PaneState {
  open: boolean;
  /** Width in pixels of the side on which the pane stands. The tool panes share the side and the width of the Catalog pane. */
  width: number;
}

/** The widths that a side may take, in pixels, and the change that one press of an arrow key makes. */
export const PANE_WIDTH = { smallest: 192, first: 288, largest: 480, step: 16 } as const;

/** Both panes start open, as in a GIS program, when the window is wide enough for them and the map. */
function firstState(): Record<PaneId, PaneState> {
  const open = window.matchMedia("(min-width: 64em)").matches;
  return {
    contents: { open, width: PANE_WIDTH.first },
    catalog: { open, width: PANE_WIDTH.first },
  };
}

export const panesStore = createStore(firstState());

/** Return the pane that holds the width of a side. */
export function widthHolder(side: PaneSide): PaneId {
  return side === "left" ? "contents" : "catalog";
}

/** Bring a width inside the limits of a side. */
export function clampWidth(width: number): number {
  return Math.min(PANE_WIDTH.largest, Math.max(PANE_WIDTH.smallest, Math.round(width)));
}

/**
 * Return the width of a side after a key is pressed on its edge, or undefined for a key that does not change it.
 * An arrow key moves the edge by one step, Home gives the smallest width and End the largest.
 */
export function widthAfterKey(width: number, key: string, side: PaneSide): number | undefined {
  const outwards = side === "left" ? "ArrowRight" : "ArrowLeft";
  const inwards = side === "left" ? "ArrowLeft" : "ArrowRight";
  switch (key) {
    case outwards:
      return clampWidth(width + PANE_WIDTH.step);
    case inwards:
      return clampWidth(width - PANE_WIDTH.step);
    case "Home":
      return PANE_WIDTH.smallest;
    case "End":
      return PANE_WIDTH.largest;
    default:
      return undefined;
  }
}

/** Show or hide a pane. A pane that is shown comes to the front of its side. */
export function setPaneOpen(id: PaneId, open: boolean): void {
  const panes = panesStore.get();
  panesStore.set({ ...panes, [id]: { ...panes[id], open } });
  if (open) {
    showPane(id);
  }
}

/** Set the width of the side of a pane, inside its limits. */
export function setPaneWidth(id: PaneId, width: number): void {
  const panes = panesStore.get();
  panesStore.set({ ...panes, [id]: { ...panes[id], width: clampWidth(width) } });
}

/** Return both panes to their first state. */
export function resetPanes(): void {
  panesStore.set(firstState());
}
