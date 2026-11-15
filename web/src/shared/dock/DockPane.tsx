import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../icon/Icon";
import { Info } from "../info/Info";
import { useStore } from "../store";
import {
  dockStore,
  enterDock,
  frontOf,
  leaveDock,
  paneElementId,
  panesOf,
  passFocus,
  sideOf,
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
 * One pane of the stack beside the map: its title bar with the close button, and its content. A pane with an
 * explanation shows the button of the explanation beside its title. The pane enters the stack of its side while
 * it is drawn. Only the pane in front is visible; the others keep their state.
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
  const shown = frontOf(dock, side) === id;
  const stacked = panesOf(dock, side).length > 1;
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

  const onKeyDown = (event: KeyboardEvent) => {
    // The Escape key inside a dialog that the pane has opened closes that dialog and nothing else.
    const inDialog = event.target instanceof Element && event.target.closest("dialog") !== null;
    if (event.key !== "Escape" || inDialog || event.defaultPrevented) {
      return;
    }
    if (event.shiftKey) {
      onClose();
    } else {
      passFocus();
    }
  };

  return (
    <div
      className="dock-pane"
      id={paneElementId(id)}
      role={stacked ? "tabpanel" : undefined}
      aria-labelledby={stacked ? tabElementId(id) : undefined}
      hidden={!shown}
      onKeyDown={onKeyDown}
    >
      <aside className="pane" aria-labelledby={headingId} aria-describedby={info ? infoId : undefined}>
        <header className="pane-header">
          <h2 className="pane-title" id={headingId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {info ? (
            <Info id={infoId} about={title}>
              {info}
            </Info>
          ) : null}
          <button type="button" className="pane-close" aria-label={`Close the ${title} pane`} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
