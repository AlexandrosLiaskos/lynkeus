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
 * A pane can hide automatically, as a pane with Auto-Hide does in ArcGIS Pro. It leaves the stack and becomes a
 * tab in a strip at the edge of the window. A click on the tab shows the pane over the stack and the map, and the
 * pane hides again when the user works in the map. The other panes of the side stay in the stack.
 */
export interface DockState {
  /** The panes that are shown, in the order in which they appeared. The tabs of a side follow this order. */
  panes: readonly DockPaneEntry[];
  /** The pane that was last brought to the front of the stack of each side, or null. */
  front: Readonly<Record<PaneSide, string | null>>;
  /** The names of the panes that hide automatically. A pane keeps this state while it is closed. */
  hidden: readonly string[];
  /** The pane that hides automatically and was last shown over the map, on each side, or null. */
  revealed: Readonly<Record<PaneSide, string | null>>;
  /** The names of the tool panes that are open. */
  tools: readonly string[];
  /** The last request to move the keyboard focus to the title of a tool pane. Every request is a new object. */
  focus: { readonly id: string } | null;
}

const EMPTY: DockState = {
  panes: [],
  front: { left: null, right: null },
  hidden: [],
  revealed: { left: null, right: null },
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

/** Return the panes that are shown on one side, in the order in which they appeared. */
export function panesOf(state: DockState, side: PaneSide): readonly DockPaneEntry[] {
  return state.panes.filter(({ id }) => sideOf(id) === side);
}

/** Tell whether a pane hides automatically. */
export function isHidden(state: DockState, id: string): boolean {
  return state.hidden.includes(id);
}

/** Return the panes in the stack of one side, in the order of their tabs under the stack. */
export function stackOf(state: DockState, side: PaneSide): readonly DockPaneEntry[] {
  return panesOf(state, side).filter(({ id }) => !isHidden(state, id));
}

/** Return the panes of one side that hide automatically, in the order of their tabs at the edge of the window. */
export function hiddenOf(state: DockState, side: PaneSide): readonly DockPaneEntry[] {
  return panesOf(state, side).filter(({ id }) => isHidden(state, id));
}

/** Return the name of the pane in front of the stack of one side, or null when the stack holds no pane. */
export function frontOf(state: DockState, side: PaneSide): string | null {
  const panes = stackOf(state, side);
  const asked = state.front[side];
  return panes.some(({ id }) => id === asked) ? asked : (panes.at(-1)?.id ?? null);
}

/** Return the name of the pane that hides automatically and shows over the map on one side, or null. */
export function revealedOf(state: DockState, side: PaneSide): string | null {
  const asked = state.revealed[side];
  return hiddenOf(state, side).some(({ id }) => id === asked) ? asked : null;
}

/** Tell whether a pane is drawn: in front of its stack or, for a pane that hides automatically, over the map. */
export function isShown(state: DockState, id: string): boolean {
  const side = sideOf(id);
  return (isHidden(state, id) ? revealedOf(state, side) : frontOf(state, side)) === id;
}

/** The id of the element of a pane, and of its tab under the stack or in the strip at the edge of the window. */
export function paneElementId(id: string): string {
  return `dock-pane-${id}`;
}

export function tabElementId(id: string): string {
  return `dock-tab-${id}`;
}

/** Return the pane of a stack that comes to the front when another one leaves: the one before it, or else after it. */
function neighbourOf(stack: readonly DockPaneEntry[], id: string): string | null {
  const index = stack.findIndex((pane) => pane.id === id);
  return (stack[index - 1] ?? stack[index + 1])?.id ?? null;
}

/**
 * Add a pane to its side. A pane of the stack comes to the front, and a pane that hides automatically takes its
 * tab at the edge of the window. A pane that is already there takes the new title.
 */
export function enterDock(entry: DockPaneEntry): void {
  const state = dockStore.get();
  dockStore.set({
    ...state,
    panes: state.panes.some(({ id }) => id === entry.id)
      ? state.panes.map((pane) => (pane.id === entry.id ? entry : pane))
      : [...state.panes, entry],
    front: isHidden(state, entry.id) ? state.front : { ...state.front, [sideOf(entry.id)]: entry.id },
  });
}

/** Take a pane out of its side. When it was in front of the stack, the pane before it comes to the front. */
export function leaveDock(id: string): void {
  const state = dockStore.get();
  const side = sideOf(id);
  if (!state.panes.some((pane) => pane.id === id)) {
    return;
  }
  dockStore.set({
    ...state,
    panes: state.panes.filter((pane) => pane.id !== id),
    front:
      frontOf(state, side) === id ? { ...state.front, [side]: neighbourOf(stackOf(state, side), id) } : state.front,
  });
}

/**
 * Show a pane. A pane of the stack comes to the front, and the pane that showed over the stack hides. A pane
 * that hides automatically shows over the map.
 */
export function showPane(id: string): void {
  const state = dockStore.get();
  const side = sideOf(id);
  if (isHidden(state, id)) {
    if (state.revealed[side] !== id) {
      dockStore.set({ ...state, revealed: { ...state.revealed, [side]: id } });
    }
  } else if (state.front[side] !== id || state.revealed[side] !== null) {
    dockStore.set({
      ...state,
      front: { ...state.front, [side]: id },
      revealed: { ...state.revealed, [side]: null },
    });
  }
}

/**
 * Make a pane hide automatically, or return it to the stack of its side. A pane that starts to hide becomes a
 * tab at the edge of the window at once, and a pane that returns to the stack comes to its front.
 */
export function setAutoHide(id: string, autoHide: boolean): void {
  const state = dockStore.get();
  const side = sideOf(id);
  if (isHidden(state, id) === autoHide) {
    return;
  }
  if (autoHide) {
    dockStore.set({
      ...state,
      hidden: [...state.hidden, id],
      front:
        frontOf(state, side) === id ? { ...state.front, [side]: neighbourOf(stackOf(state, side), id) } : state.front,
      revealed: state.revealed[side] === id ? { ...state.revealed, [side]: null } : state.revealed,
    });
  } else {
    dockStore.set({
      ...state,
      hidden: state.hidden.filter((hidden) => hidden !== id),
      front: { ...state.front, [side]: id },
      revealed: { ...state.revealed, [side]: null },
    });
  }
}

/** Return every pane that hides automatically to the stack of its side. */
export function pinAllPanes(): void {
  const state = dockStore.get();
  if (state.hidden.length > 0) {
    dockStore.set({ ...state, hidden: [], revealed: { left: null, right: null } });
  }
}

/** Hide the pane that shows over the map on one side. */
export function concealPanes(side: PaneSide): void {
  const state = dockStore.get();
  if (state.revealed[side] !== null) {
    dockStore.set({ ...state, revealed: { ...state.revealed, [side]: null } });
  }
}

/**
 * What a click on the tab of a pane that hides automatically does: it shows the pane over the map, or hides the
 * pane when it is the one that shows.
 */
export function togglePane(id: string): void {
  const side = sideOf(id);
  if (revealedOf(dockStore.get(), side) === id) {
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
 * Open the pane of a tool, show it and move the keyboard focus to its title. A ribbon button calls this with its
 * own name; the component `ToolPane` with the same name draws the pane. The pane opens in the stack, in front,
 * unless the user has made this pane hide automatically; it then shows over the map.
 */
export function openToolPane(id: string): void {
  const state = dockStore.get();
  const side = sideOf(id);
  const hidden = isHidden(state, id);
  if (document.activeElement && !paneHoldsFocus(id)) {
    openers.set(id, document.activeElement);
  }
  dockStore.set({
    ...state,
    tools: state.tools.includes(id) ? state.tools : [...state.tools, id],
    front: hidden ? state.front : { ...state.front, [side]: id },
    revealed: { ...state.revealed, [side]: hidden ? id : null },
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

/** Close every tool pane, forget the order of the panes and return every pane to its stack. The tests start from this state. */
export function resetDock(): void {
  openers.clear();
  dockStore.set(EMPTY);
}
