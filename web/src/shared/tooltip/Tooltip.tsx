import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** The time that the pointer rests on an element before its description shows, in milliseconds. */
export const HOVER_DELAY = 500;

/** The largest width of a description, in pixels. The style file gives the same value. */
const WIDTH = 256;

interface TooltipProps {
  /** Name of the element. */
  title: string;
  /** One sentence on what the element does. */
  text: string;
  /** A second sentence, for example the reason why the element is inactive. */
  note?: string;
  /** The element that is described. It receives the id of the description for its `aria-describedby` attribute. */
  children: (describedBy: string) => ReactNode;
}

/**
 * The description of a button. It shows under the button while the pointer rests on it or while the button has
 * keyboard focus. The Escape key hides it, and the pointer may move onto it without hiding it, as the criterion
 * 1.4.13 of the Web Content Accessibility Guidelines asks.
 */
export function Tooltip({ title, text, note, children }: TooltipProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    // The anchor has no box of its own, so the place is taken from the element that it holds.
    const box = anchor.current?.firstElementChild?.getBoundingClientRect();
    if (box) {
      setPosition({ left: Math.max(0, Math.min(box.left, window.innerWidth - WIDTH)), top: box.bottom });
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
      // The description shows when the keyboard brings the focus, and stays hidden when a click does.
      onFocus={() => {
        if (!pressed.current) {
          show();
        }
      }}
      onBlur={hide}
    >
      {children(id)}
      <span role="tooltip" className="tooltip" hidden={!position} style={position ?? undefined}>
        <strong className="tooltip-title">{title}</strong>
        <span id={id}>
          {text}
          {note ? ` ${note}` : null}
        </span>
      </span>
    </span>
  );
}
