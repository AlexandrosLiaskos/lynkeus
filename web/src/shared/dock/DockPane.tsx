// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { m } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Icon } from "../icon/Icon";
import { Info } from "../info/Info";
import { useStore } from "../store";
import { EASE_ENTER, EASE_EXIT, MOTION_PANE } from "../tokens/motion";
import { IconButton } from "../toolbar/IconButton";
import {
  concealPanes,
  dockStore,
  enterDock,
  isHidden,
  isShown,
  leaveDock,
  paneElementId,
  passFocus,
  revealedOf,
  setAutoHide,
  sideOf,
  stackOf,
  tabElementId,
  type PaneSide,
} from "./dock";

interface DockPaneProps {
  /** Unique name of the pane. */
  id: string;
  /** Name of the pane, shown at its top and on its tab. */
  title: string;
  /** The explanation of the pane, in complete sentences. It shows from the "i" beside the title. */
  info?: ReactNode;
  /** Called when the user closes the pane, with its close button or with Shift and Escape. */
  onClose: () => void;
  /** What stands under the title bar. */
  children: ReactNode;
}

/** How far a pane that shows from its tab at the edge of the window moves while it enters or leaves, in pixels. */
const PANE_SHIFT = 12;

/**
 * A pane that is drawn. A pane of the stack only fades in, so that it never reaches outside the window. The
 * variable `--dock-pane-display` of the styles is set back at once, so that the pane can fade the next time it
 * hides to the edge of the window.
 */
const SHOWN = {
  opacity: 1,
  x: 0,
  "--dock-pane-display": "flex",
  transition: {
    duration: MOTION_PANE,
    ease: EASE_ENTER,
    x: { duration: 0 },
    "--dock-pane-display": { duration: 0 },
  },
};

/** A pane that hides automatically moves in from the edge of the window while it fades in. */
const SHOWN_OVER = {
  ...SHOWN,
  transition: { duration: MOTION_PANE, ease: EASE_ENTER, "--dock-pane-display": { duration: 0 } },
};

/**
 * A pane of the stack that is not in front. The styles take it from the page at once, because the pane in front
 * stands in its place, so it has no motion. It carries the variable of the styles from its first drawing, so
 * that the library never has to read a value for it from the page.
 */
const BEHIND = { opacity: 0, x: 0, "--dock-pane-display": "flex", transition: { duration: 0 } };

/**
 * A pane that hides automatically and does not show: it fades while it moves to the edge of the window on its
 * side. When that motion has ended, the library sets the variable with which the styles take the pane from the
 * page (see `_dock.scss`).
 */
function awayAt(side: PaneSide) {
  return {
    opacity: 0,
    x: side === "left" ? -PANE_SHIFT : PANE_SHIFT,
    transition: { duration: MOTION_PANE, ease: EASE_EXIT },
    transitionEnd: { "--dock-pane-display": "none" },
  };
}

/**
 * One pane of the stack beside the map: its title bar with the pin and the close button, and its content. A
 * pane with an explanation shows the button of the explanation beside its title. The pane enters the stack of its
 * side while it is drawn. Only the pane in front is visible; the others keep their state.
 *
 * The pin makes the pane hide automatically, as Auto-Hide does in ArcGIS Pro: the pane leaves the stack and
 * becomes a tab at the edge of the window (see `Dock`). The pin of a pane that shows from its tab returns the pane
 * to the stack.
 *
 * The pane enters and leaves with the Motion library, on its opacity and its transform only, so that the motion
 * never changes the layout of the page. A pane that opens in the stack, or comes to its front, fades in. A pane
 * that shows from its tab moves in from the edge of the window while it fades in, and it moves back while it
 * fades out when it hides and when its pin sends it to the edge, and it is taken from the page when that motion
 * has ended. From the moment a pane starts to leave it is `inert`: it cannot hold the keyboard focus, the Tab key
 * does not reach it and a screen reader does not read it.
 * A pane that closes leaves the page at once. The motion needs the `Dock` around the pane, which loads the part
 * of the library that moves an element.
 *
 * The pane is not modal. The Escape key returns the keyboard focus to the map, as ArcGIS Pro documents for its
 * Contents pane, and Shift with Escape closes the pane, as ArcGIS Pro 3.0 documents for the active pane. The
 * components `Pane`, `ToolPane` and `InfoPane` are built on this one. A part of the interface uses those three:
 * `ToolPane` for the form of a tool, and `InfoPane` for a pane that runs no tool.
 */
export function DockPane({ id, title, info, onClose, children }: DockPaneProps) {
  const dock = useStore(dockStore);
  const headingId = useId();
  const infoId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = useRef<object | null>(null);
  const side = sideOf(id);
  const autoHide = isHidden(dock, id);
  const shown = isShown(dock, id);
  const stacked = !autoHide && stackOf(dock, side).length > 1;
  const request = dock.focus;

  // The pane is in the stack from before the page is painted, so no other pane shows in its place for a moment.
  useLayoutEffect(() => {
    enterDock({ id, title });
    return () => leaveDock(id);
  }, [id, title]);

  // A request for the keyboard focus is answered once, when the pane is in front and can take the focus.
  useEffect(() => {
    if (shown && request?.id === id && answered.current !== request) {
      answered.current = request;
      heading.current?.focus();
    }
  }, [shown, request, id]);

  const close = () => {
    if (revealedOf(dock, side) === id) {
      concealPanes(side);
    }
    onClose();
  };

  // The pin button leaves the page with the pane that hides, so the keyboard focus moves to the tab of the pane.
  const togglePin = () => {
    if (autoHide) {
      setAutoHide(id, false);
    } else {
      flushSync(() => setAutoHide(id, true));
      document.getElementById(tabElementId(id))?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // The Escape key inside a dialog that the pane has opened closes that dialog and nothing else.
    const inDialog = event.target instanceof Element && event.target.closest("dialog") !== null;
    if (event.key !== "Escape" || inDialog || event.defaultPrevented) {
      return;
    }
    if (event.shiftKey) {
      close();
    } else {
      passFocus();
    }
  };

  const away = autoHide ? awayAt(side) : BEHIND;

  return (
    <m.div
      className={autoHide ? "dock-pane dock-pane--over" : "dock-pane"}
      id={paneElementId(id)}
      role={stacked ? "tabpanel" : undefined}
      aria-labelledby={stacked ? tabElementId(id) : undefined}
      hidden={!shown}
      inert={!shown}
      initial={away}
      animate={shown ? (autoHide ? SHOWN_OVER : SHOWN) : away}
      onKeyDown={onKeyDown}
    >
      <aside
        className={autoHide ? "pane pane--auto" : "pane"}
        aria-labelledby={headingId}
        aria-describedby={info ? infoId : undefined}
      >
        <header className="pane-header">
          <h2 className="pane-title" id={headingId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {info ? (
            <Info id={infoId} about={title}>
              {info}
            </Info>
          ) : null}
          <span className="pane-buttons">
            <IconButton
              icon="push_pin"
              label={autoHide ? `Pin the ${title} pane` : `Auto-hide the ${title} pane`}
              onClick={togglePin}
            />
            <button type="button" className="pane-close" aria-label={`Close the ${title} pane`} onClick={close}>
              <Icon name="close" />
            </button>
          </span>
        </header>
        {children}
      </aside>
    </m.div>
  );
}
