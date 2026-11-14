import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** The time that the pointer rests on an element before its description shows, in milliseconds. */
export const HOVER_DELAY = 500;

/** The largest width of a description, in pixels. The style file gives the same value. */
const WIDTH = 256;

/** The clear strip between an element, or its row, and the description, in pixels. */
const GAP = 4;

interface TooltipProps {
  /** Name of the element. */
  title: string;
  /** One sentence on what the element does. An element whose name says it all, such as an icon button, has none. */
  text?: string;
  /** A second sentence, for example the reason why the element is inactive. */
  note?: string;
  /** The element that is described. It receives the id of the description for its `aria-describedby` attribute. */
  children: (describedBy: string) => ReactNode;
}

/**
 * The description of a button, or the name alone of a button that shows only an icon. It shows under the button
 * while the pointer rests on it or while the button has keyboard focus. The Escape key hides it, and the pointer
 * may move onto it without hiding it, as the criterion 1.4.13 of the Web Content Accessibility Guidelines asks.
 *
 * An element that holds the button may carry the attribute `data-tooltip-row`. The description then shows under
 * that element, so that it does not cover what the element shows under the button, as the ribbon shows the name
 * of a group.
 */
export function Tooltip({ title, text, note, children }: TooltipProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number; borderTopWidth: number } | null>(null);

  const show = () => {
    // The anchor has no box of its own, so the place is taken from the element that it holds.
    const element = anchor.current?.firstElementChild;
    if (element) {
      const box = element.getBoundingClientRect();
      const row = element.closest("[data-tooltip-row]")?.getBoundingClientRect();
      setPosition({
        left: Math.max(0, Math.min(box.left, window.innerWidth - WIDTH)),
        top: box.bottom,
        // The clear strip reaches from the element to the description, so the pointer can cross it.
        borderTopWidth: Math.max(0, (row?.bottom ?? box.bottom) - box.bottom) + GAP,
      });
    }
  };

  const hide = () => {
    window.clearTimeout(timer.current);
    setPosition(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The Escape key hides the description wherever the keyboard focus is, so that a user of the pointer can
  // also hide it without moving the pointer.
  useEffect(() => {
    if (!position) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.clearTimeout(timer.current);
        setPosition(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [position]);

  return (
    <span
      ref={anchor}
      className="tooltip-anchor"
      onPointerEnter={() => {
        timer.current = window.setTimeout(show, HOVER_DELAY);
      }}
      onPointerLeave={hide}
      onPointerDown={() => {
        pressed.current = true;
        hide();
      }}
      onPointerUp={() => {
        pressed.current = false;
      }}
      // The description shows when the keyboard brings the focus. It stays hidden when a click does, and when
      // the focus returns to the element after a pane or a dialog that a click had opened is closed.
      onFocus={(event) => {
        if (!pressed.current && event.target.matches(":focus-visible")) {
          show();
        }
      }}
      onBlur={hide}
    >
      {children(id)}
      <span role="tooltip" className="tooltip" hidden={!position} style={position ?? undefined}>
        <strong className="tooltip-title">{title}</strong>
        {text === undefined && note === undefined ? null : (
          <span id={id}>
            {text}
            {note ? ` ${note}` : null}
          </span>
        )}
      </span>
    </span>
  );
}
