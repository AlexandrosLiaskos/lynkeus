import { useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Icon } from "../icon/Icon";
import { PANE_WIDTH, panesStore, setPaneOpen, setPaneWidth, sideOf, widthAfterKey, type PaneId } from "../panes";
import { useStore } from "../store";

interface PaneProps {
  id: PaneId;
  /** Name of the pane, shown at its top. */
  title: string;
  children: ReactNode;
}

/**
 * The frame of a pane beside the map: its title, its close button and the edge that changes its width. The edge
 * is dragged with the pointer or moved with the arrow keys, as the window splitter of the ARIA Authoring
 * Practices Guide describes.
 */
export function Pane({ id, title, children }: PaneProps) {
  const { open, width } = useStore(panesStore)[id];
  const headingId = useId();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const side = sideOf(id);

  if (!open) {
    return null;
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const next = widthAfterKey(width, event.key, side);
    if (next !== undefined) {
      event.preventDefault();
      setPaneWidth(id, next);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag.current) {
      const moved = event.clientX - drag.current.x;
      setPaneWidth(id, drag.current.width + (side === "left" ? moved : -moved));
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <aside className={`pane pane--${side}`} style={{ width }} aria-labelledby={headingId}>
      <header className="pane-header">
        <h2 className="pane-title" id={headingId}>
          {title}
        </h2>
        <button
          type="button"
          className="pane-close"
          aria-label={`Close the ${title} pane`}
          onClick={() => setPaneOpen(id, false)}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="pane-body">{children}</div>
      <div
        className="pane-edge"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={`Width of the ${title} pane`}
        aria-valuenow={width}
        aria-valuemin={PANE_WIDTH.smallest}
        aria-valuemax={PANE_WIDTH.largest}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </aside>
  );
}
