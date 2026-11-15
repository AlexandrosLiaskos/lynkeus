import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { placeBubble } from "../info/place";

/** The time that the pointer rests on an element before its description shows, in milliseconds. */
export const HOVER_DELAY = 500;

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

/** The place of a description in the window, and the heights of the clear strips at its two edges, in pixels. */
interface Position {
  left: number;
  top: number;
  borderTopWidth: number;
  borderBottomWidth: number;
}

/**
 * The description of a button, or the name alone of a button that shows only an icon. It shows under the button
 * while the pointer rests on it or while the button has keyboard focus. The Escape key hides it, and the pointer
 * may move onto it without hiding it, as the criterion 1.4.13 of the Web Content Accessibility Guidelines asks.
 *
 * The description stays inside the window (see `placeBubble`): it moves to the left at the right edge of the
 * window, and it shows above its button when it has no room under it, as at the lower edge of the window.
 *
 * An element that holds the button may carry the attribute `data-tooltip-row`. The description then shows under
 * that element, or above it, so that it does not cover what the element shows beside the button, as the ribbon
 * shows the name of a group.
 */
export function Tooltip({ title, text, note, children }: TooltipProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const bubble = useRef<HTMLSpanElement>(null);
  const pressed = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);

  const show = () => {
    // The anchor has no box of its own, so the place is taken from the element that it holds.
    const element = anchor.current?.firstElementChild;
    const description = bubble.current;
    if (!element || !description) {
      return;
    }
    const box = element.getBoundingClientRect();
    const row = element.closest("[data-tooltip-row]")?.getBoundingClientRect();
    // The clear strip reaches from the element to the description, so the pointer can cross it.
    const under = Math.max(0, (row?.bottom ?? box.bottom) - box.bottom) + GAP;
    const over = Math.max(0, box.top - (row?.top ?? box.top)) + GAP;
    // The description keeps its size while it is not shown. Its height is taken without the strips.
    const { left, top, above } = placeBubble(
      { left: box.left, top: box.top - over, bottom: box.bottom + under },
      { width: description.offsetWidth, height: description.clientHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition(
      above
        ? { left, top, borderTopWidth: 0, borderBottomWidth: over }
        : { left, top: box.bottom, borderTopWidth: under, borderBottomWidth: 0 },
    );
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
      <span ref={bubble} role="tooltip" className="tooltip" hidden={!position} style={position ?? undefined}>
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
