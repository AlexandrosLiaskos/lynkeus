import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Icon } from "../icon/Icon";
import { PANE_WIDTH, panesStore, setPaneWidth, widthAfterKey, widthHolder, type PaneSide } from "../panes";
import { useStore } from "../store";
import {
  concealPanes,
  dockStore,
  frontOf,
  paneElementId,
  panesOf,
  showPane,
  shownOf,
  tabElementId,
  togglePane,
} from "./dock";

interface DockProps {
  side: PaneSide;
  /** The icon of a pane on its tab at the edge of the window, by the name of the pane. A pane may have none. */
  icons?: Readonly<Record<string, string>>;
  /** The components that draw the panes of this side. Each one draws its pane or nothing. */
  children: ReactNode;
}

/**
 * The place of the panes on one side of the map. The panes stand in one stack, as stacked panes do in ArcGIS Pro:
 * one pane is in front, and when the stack holds more than one pane a row of tabs under it brings another pane to
 * the front. The edge between the stack and the map changes the width of the side. It is dragged with the pointer
 * or moved with the arrow keys, as the window splitter of the ARIA Authoring Practices Guide describes. A side
 * without a pane takes no room.
 *
 * The pin in the title bar of a pane makes the side hide its panes automatically, as Auto-Hide does in ArcGIS
 * Pro. The side is then a strip at the edge of the window with one tab for each pane, its name written from top
 * to bottom. A click on a tab shows its pane over the map, which keeps its size, and a second click hides it. The
 * pane also hides when the pointer is pressed, or the keyboard focus moves, outside the side.
 */
export function Dock({ side, icons, children }: DockProps) {
  const dock = useStore(dockStore);
  const holder = widthHolder(side);
  const { width } = useStore(panesStore)[holder];
  const drag = useRef<{ x: number; width: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panes = panesOf(dock, side);
  const front = frontOf(dock, side);
  const shown = shownOf(dock, side);
  const autoHide = dock.autoHide[side];
  const revealed = autoHide && shown !== null;
  const place = `on the ${side} of the map`;

  // A pane that shows over the map hides when the user works elsewhere: in the map, in the ribbon or in the
  // panes of the other side. A dialog that the pane has opened is declared inside the side and counts as it.
  useEffect(() => {
    if (!revealed) {
      return;
    }
    const onElsewhere = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        concealPanes(side);
      }
    };
    document.addEventListener("pointerdown", onElsewhere, true);
    document.addEventListener("focusin", onElsewhere);
    return () => {
      document.removeEventListener("pointerdown", onElsewhere, true);
      document.removeEventListener("focusin", onElsewhere);
    };
  }, [revealed, side]);

  // The left and right arrow keys move between the tabs, and Home and End go to the first and the last one.
  const onTabKeyDown = (event: KeyboardEvent) => {
    const current = panes.findIndex(({ id }) => id === front);
    const last = panes.length - 1;
    const index =
      event.key === "ArrowRight"
        ? (current + 1) % panes.length
        : event.key === "ArrowLeft"
          ? (current + last) % panes.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    const next = panes[index];
    if (next) {
      event.preventDefault();
      showPane(next.id);
      document.getElementById(tabElementId(next.id))?.focus();
    }
  };

  const onEdgeKeyDown = (event: KeyboardEvent) => {
    const next = widthAfterKey(width, event.key, side);
    if (next !== undefined) {
      event.preventDefault();
      setPaneWidth(holder, next);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag.current) {
      const moved = event.clientX - drag.current.x;
      setPaneWidth(holder, drag.current.width + (side === "left" ? moved : -moved));
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const className =
    panes.length === 0
      ? "dock dock--empty"
      : `dock dock--${side}${autoHide ? " dock--auto" : ""}${revealed ? " dock--out" : ""}`;

  return (
    <div ref={root} className={className} style={{ "--dock-width": `${String(width)}px` } as CSSProperties}>
      {autoHide && panes.length > 0 ? (
        <div className="dock-rail" role="group" aria-label={`Hidden panes ${place}`}>
          {panes.map(({ id, title }) => (
            <button
              key={id}
              type="button"
              id={tabElementId(id)}
              aria-expanded={id === shown}
              aria-controls={paneElementId(id)}
              onClick={() => togglePane(id)}
            >
              {icons?.[id] ? <Icon name={icons[id]} /> : null}
              <span className="dock-rail-name">{title}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="dock-panes">{children}</div>
      {!autoHide && panes.length > 1 ? (
        <div className="dock-tabs" role="tablist" aria-label={`Panes ${place}`} onKeyDown={onTabKeyDown}>
          {panes.map(({ id, title }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabElementId(id)}
              aria-selected={id === front}
              aria-controls={paneElementId(id)}
              tabIndex={id === front ? 0 : -1}
              onClick={() => showPane(id)}
            >
              {title}
            </button>
          ))}
        </div>
      ) : null}
      {shown !== null ? (
        <div
          className="dock-edge"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={`Width of the panes ${place}`}
          aria-valuenow={width}
          aria-valuemin={PANE_WIDTH.smallest}
          aria-valuemax={PANE_WIDTH.largest}
          onKeyDown={onEdgeKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : null}
    </div>
  );
}
