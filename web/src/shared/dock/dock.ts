import { createStore } from "../store";

export type PaneSide = "left" | "right";

/** A pane that is shown beside the map. */
export interface DockPaneEntry {
  /** Unique name of the pane. A tool pane carries the name of the ribbon button that opens it. */
  id: string;
  /** Name shown at the top of the pane and on its tab. */
  title: string;
}

/**
 * The panes beside the map. The panes of one side stand in one stack, as stacked panes do in ArcGIS Pro: one of
 * them is in front, and a row of tabs under the stack brings another one to the front.
 *
 * A side can hide its panes automatically, as Auto-Hide does in ArcGIS Pro. The panes of the side are then tabs
 * in a strip at the edge of the window. A click on a tab shows its pane over the map, and the pane hides again
 * when the user works elsewhere.
 */
export interface DockState {
  /** The panes that are shown, in the order in which they appeared. The tabs of a side follow this order. */
  panes: readonly DockPaneEntry[];
  /** The pane that was last brought to the front of each side, or null. */
  front: Readonly<Record<PaneSide, string | null>>;
  /** Whether each side hides its panes automatically. */
  autoHide: Readonly<Record<PaneSide, boolean>>;
  /** For a side that hides its panes: whether its pane in front shows over the map now. */
  revealed: Readonly<Record<PaneSide, boolean>>;
  /** The names of the tool panes that are open. */
  tools: readonly string[];
  /** The last request to move the keyboard focus to the title of a tool pane. Every request is a new object. */
  focus: { readonly id: string } | null;
}

const EMPTY: DockState = {
  panes: [],
  front: { left: null, right: null },
  autoHide: { left: false, right: false },
  revealed: { left: false, right: false },
  tools: [],
  focus: null,
};

export const dockStore = createStore<DockState>(EMPTY);

/** The element that had the keyboard focus when each tool pane was opened. */
const openers = new Map<string, Element>();

/** Return the side of the map on which a pane stands: the Contents pane on the left, every other pane on the right. */
export function sideOf(id: string): PaneSide {
  return id === "contents" ? "left" : "right";
}

/** Return the panes that are shown on one side, in the order of their tabs. */
export function panesOf(state: DockState, side: PaneSide): readonly DockPaneEntry[] {
  return state.panes.filter(({ id }) => sideOf(id) === side);
}

/** Return the name of the pane in front on one side, or null when the side shows no pane. */
export function frontOf(state: DockState, side: PaneSide): string | null {
  const panes = panesOf(state, side);
  const asked = state.front[side];
  return panes.some(({ id }) => id === asked) ? asked : (panes.at(-1)?.id ?? null);
}

/**
 * Return the name of the pane that is visible on one side, or null. A side that hides its panes shows its pane
 * in front only while that pane is revealed.
 */
export function shownOf(state: DockState, side: PaneSide): string | null {
  return state.autoHide[side] && !state.revealed[side] ? null : frontOf(state, side);
}

/** The id of the element of a pane, and of its tab in the row of tabs or in the strip at the edge of the window. */
export function paneElementId(id: string): string {
  return `dock-pane-${id}`;
}

export function tabElementId(id: string): string {
  return `dock-tab-${id}`;
}

/** Add a pane to the stack of its side and bring it to the front. A pane that is already there takes the new title. */
export function enterDock(entry: DockPaneEntry): void {
  const state = dockStore.get();
  dockStore.set({
    ...state,
    panes: state.panes.some(({ id }) => id === entry.id)
      ? state.panes.map((pane) => (pane.id === entry.id ? entry : pane))
      : [...state.panes, entry],
    front: { ...state.front, [sideOf(entry.id)]: entry.id },
  });
}

/** Take a pane out of the stack of its side. When it was in front, the pane before it comes to the front. */
export function leaveDock(id: string): void {
  const state = dockStore.get();
  const side = sideOf(id);
  const panes = panesOf(state, side);
  const index = panes.findIndex((pane) => pane.id === id);
  if (index < 0) {
    return;
  }
  const next = panes[index - 1] ?? panes[index + 1];
  dockStore.set({
    ...state,
    panes: state.panes.filter((pane) => pane.id !== id),
    front: frontOf(state, side) === id ? { ...state.front, [side]: next?.id ?? null } : state.front,
  });
}

/** Bring a pane to the front of its side. On a side that hides its panes, the pane shows over the map. */
export function showPane(id: string): void {
  const state = dockStore.get();
  const side = sideOf(id);
  const reveal = state.autoHide[side] && !state.revealed[side];
  if (state.front[side] !== id || reveal) {
    dockStore.set({
      ...state,
      front: { ...state.front, [side]: id },
      revealed: reveal ? { ...state.revealed, [side]: true } : state.revealed,
    });
  }
}

/**
 * Make a side hide its panes automatically, or keep them open beside the map. A side that starts to hide its
 * panes hides them at once.
 */
export function setAutoHide(side: PaneSide, autoHide: boolean): void {
  const state = dockStore.get();
  if (state.autoHide[side] !== autoHide || state.revealed[side]) {
    dockStore.set({
      ...state,
      autoHide: { ...state.autoHide, [side]: autoHide },
      revealed: { ...state.revealed, [side]: false },
    });
  }
}

/** Hide the pane that a side which hides its panes shows over the map. */
export function concealPanes(side: PaneSide): void {
  const state = dockStore.get();
  if (state.revealed[side]) {
    dockStore.set({ ...state, revealed: { ...state.revealed, [side]: false } });
  }
}

/**
 * What a click on the tab of a hidden pane does: it shows the pane over the map, or hides the pane when it is
 * the one that shows.
 */
export function togglePane(id: string): void {
  const side = sideOf(id);
  if (shownOf(dockStore.get(), side) === id) {
    concealPanes(side);
  } else {
    showPane(id);
  }
}

/** Tell whether the keyboard focus is inside a pane. */
export function paneHoldsFocus(id: string): boolean {
  return document.getElementById(paneElementId(id))?.contains(document.activeElement) ?? false;
}

/**
 * Give the keyboard focus to an element that is still on the page, or else to the map, which is the main
 * element of the page. A pane that closes with the focus inside it passes the focus on in this way.
 */
export function passFocus(to?: Element): void {
  const target = to instanceof HTMLElement && to.isConnected ? to : document.querySelector<HTMLElement>("main");
  target?.focus();
}

/**
 * Open the pane of a tool, bring it to the front and move the keyboard focus to its title. A ribbon button calls
 * this with its own name; the component `ToolPane` with the same name draws the pane.
 */
export function openToolPane(id: string): void {
  const state = dockStore.get();
  const side = sideOf(id);
  if (document.activeElement && !paneHoldsFocus(id)) {
    openers.set(id, document.activeElement);
  }
  dockStore.set({
    ...state,
    tools: state.tools.includes(id) ? state.tools : [...state.tools, id],
    front: { ...state.front, [side]: id },
    revealed: state.autoHide[side] ? { ...state.revealed, [side]: true } : state.revealed,
    focus: { id },
  });
}

/**
 * Close the pane of a tool. When the keyboard focus was inside the pane, it returns to the element that opened
 * the pane or, when that element has left the page, to the map.
 */
export function closeToolPane(id: string): void {
  const state = dockStore.get();
  if (!state.tools.includes(id)) {
    return;
  }
  const held = paneHoldsFocus(id);
  dockStore.set({ ...state, tools: state.tools.filter((tool) => tool !== id) });
  if (held) {
    passFocus(openers.get(id));
  }
  openers.delete(id);
}

/** Close every tool pane, forget the order of the panes and keep both sides open. The tests start from this state. */
export function resetDock(): void {
  openers.clear();
  dockStore.set(EMPTY);
}
