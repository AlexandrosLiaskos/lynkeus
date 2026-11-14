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
 */
export interface DockState {
  /** The panes that are shown, in the order in which they appeared. The tabs of a side follow this order. */
  panes: readonly DockPaneEntry[];
  /** The pane that was last brought to the front of each side, or null. */
  front: Readonly<Record<PaneSide, string | null>>;
  /** The names of the tool panes that are open. */
  tools: readonly string[];
  /** The last request to move the keyboard focus to the title of a tool pane. Every request is a new object. */
  focus: { readonly id: string } | null;
}

const EMPTY: DockState = { panes: [], front: { left: null, right: null }, tools: [], focus: null };

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

/** The id of the element of a pane, and of its tab in the row of tabs. */
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

/** Bring a pane to the front of its side. */
export function showPane(id: string): void {
  const state = dockStore.get();
  if (state.front[sideOf(id)] !== id) {
    dockStore.set({ ...state, front: { ...state.front, [sideOf(id)]: id } });
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
  if (document.activeElement && !paneHoldsFocus(id)) {
    openers.set(id, document.activeElement);
  }
  dockStore.set({
    ...state,
    tools: state.tools.includes(id) ? state.tools : [...state.tools, id],
    front: { ...state.front, [sideOf(id)]: id },
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

/** Close every tool pane and forget the order of the panes. The tests start from this state. */
export function resetDock(): void {
  openers.clear();
  dockStore.set(EMPTY);
}
