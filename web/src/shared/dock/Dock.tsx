// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Icon } from "../icon/Icon";
import { MotionRoot } from "../motion/MotionRoot";
import { PANE_WIDTH, panesStore, setPaneWidth, widthAfterKey, widthHolder, type PaneSide } from "../panes";
import { useStore } from "../store";
import {
  concealPanes,
  dockStore,
  frontOf,
  hiddenOf,
  paneElementId,
  panesOf,
  revealedOf,
  showPane,
  stackOf,
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
 * The pin in the title bar of a pane makes that pane hide automatically, as Auto-Hide does in ArcGIS Pro. The
 * pane leaves the stack and becomes a tab in a strip at the edge of the window, its name written from top to
 * bottom; the other panes stay in the stack, with their tabs under it. A click on the tab shows the pane over
 * the stack and the map, and a second click hides it. The pane also hides when the pointer is pressed, or the
 * keyboard focus moves, in the map, and when a pane of the stack is opened or brought to the front. Work in the
 * ribbon or in the panes of the other side leaves it in place.
 *
 * The panes of the side enter and leave with the Motion library (see `DockPane`), and at once for a visitor who
 * has asked for less motion.
 */
export function Dock({ side, icons, children }: DockProps) {
  const dock = useStore(dockStore);
  const holder = widthHolder(side);
  const { width } = useStore(panesStore)[holder];
  const drag = useRef<{ x: number; width: number } | null>(null);
  const stack = stackOf(dock, side);
  const strip = hiddenOf(dock, side);
  const front = frontOf(dock, side);
  const revealed = revealedOf(dock, side);
  const place = `on the ${side} of the map`;

  // A pane that shows over the map hides when the user works in the map.
  useEffect(() => {
    if (revealed === null) {
      return;
    }
    const onMap = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".workspace-map") !== null) {
        concealPanes(side);
      }
    };
    document.addEventListener("pointerdown", onMap, true);
    document.addEventListener("focusin", onMap);
    return () => {
      document.removeEventListener("pointerdown", onMap, true);
      document.removeEventListener("focusin", onMap);
    };
  }, [revealed, side]);

  // The left and right arrow keys move between the tabs, and Home and End go to the first and the last one.
  const onTabKeyDown = (event: KeyboardEvent) => {
    const current = stack.findIndex(({ id }) => id === front);
    const last = stack.length - 1;
    const index =
      event.key === "ArrowRight"
        ? (current + 1) % stack.length
        : event.key === "ArrowLeft"
          ? (current + last) % stack.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    const next = stack[index];
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
    panesOf(dock, side).length === 0
      ? "dock dock--empty"
      : `dock dock--${side}${stack.length === 0 ? " dock--bare" : ""}`;

  return (
    <MotionRoot>
      <div className={className} style={{ "--dock-width": `${String(width)}px` } as CSSProperties}>
        {strip.length > 0 ? (
          <div className="dock-rail" role="group" aria-label={`Hidden panes ${place}`}>
            {strip.map(({ id, title }) => (
              <button
                key={id}
                type="button"
                id={tabElementId(id)}
                aria-expanded={id === revealed}
                aria-controls={paneElementId(id)}
                onClick={() => togglePane(id)}
              >
                {icons?.[id] ? <Icon name={icons[id]} /> : null}
                <span className="dock-rail-name">{title}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="dock-stack">
          <div className="dock-panes">{children}</div>
          {stack.length > 1 ? (
            <div className="dock-tabs" role="tablist" aria-label={`Panes ${place}`} onKeyDown={onTabKeyDown}>
              {stack.map(({ id, title }) => (
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
        </div>
        {stack.length > 0 || revealed !== null ? (
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
    </MotionRoot>
  );
}
