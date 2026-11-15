import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Icon } from "../icon/Icon";
import { Info } from "../info/Info";
import { useStore } from "../store";
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

/**
 * One pane of the stack beside the map: its title bar with the pin and the close button, and its content. A
 * pane with an explanation shows the button of the explanation beside its title. The pane enters the stack of its
 * side while it is drawn. Only the pane in front is visible; the others keep their state.
 *
 * The pin makes the pane hide automatically, as Auto-Hide does in ArcGIS Pro: the pane leaves the stack and
 * becomes a tab at the edge of the window (see `Dock`). The pin of a pane that shows from its tab returns the pane
 * to the stack.
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

  return (
    <div
      className={autoHide ? "dock-pane dock-pane--over" : "dock-pane"}
      id={paneElementId(id)}
      role={stacked ? "tabpanel" : undefined}
      aria-labelledby={stacked ? tabElementId(id) : undefined}
      hidden={!shown}
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
    </div>
  );
}
