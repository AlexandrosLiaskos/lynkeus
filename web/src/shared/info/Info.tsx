// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../icon/Icon";
import { placeBubble, type Place } from "./place";

interface InfoProps {
  /**
   * The id of the element that holds the explanation. The field, the group of fields or the list that the title
   * names carries this id in its `aria-describedby` attribute, so that a screen reader reads the explanation with
   * it.
   */
  id: string;
  /** The title that the explanation belongs to, as the page shows it. The button is named after it. */
  about: string;
  /** The explanation, in complete sentences. */
  children: ReactNode;
}

/** Return the place of a bubble beside its button, from their sizes and places in the window at this moment. */
function placeOf(button: HTMLElement | null, bubble: HTMLElement | null): Place | null {
  if (!button || !bubble) {
    return null;
  }
  const { width, height } = bubble.getBoundingClientRect();
  const { clientWidth, clientHeight } = document.documentElement;
  return placeBubble(button.getBoundingClientRect(), { width, height }, { width: clientWidth, height: clientHeight });
}

/**
 * The explanation of a title, behind a small circled "i" that stands beside the title, as the information
 * button beside a parameter in the Geoprocessing pane of ArcGIS Pro. The explanation shows in a bubble while the
 * pointer rests on the button or on the bubble, while the button has keyboard focus, and after the button is
 * pressed, which is how a touch screen shows it. The Escape key hides the bubble, and so does a press anywhere
 * else. The criterion 1.4.13 of the Web Content Accessibility Guidelines asks for these three things.
 *
 * The bubble is fixed to the window, so a pane that scrolls does not cut it, and it stays inside the window (see
 * `placeBubble`). The text is always in the page, also while the bubble is not shown, so the element that carries
 * its id in `aria-describedby` is described by it at all times.
 *
 * The button stands beside the title and not inside a `label`, whose text names its field. A title and its
 * button stand in an element with the class `info-title`:
 *
 *     <div className="info-title">
 *       <label className="usa-label" htmlFor="buffer-distance">Distance</label>
 *       <Info id="buffer-distance-info" about="Distance">
 *         The width of the buffer in metres, as a number greater than zero, for example 250.
 *       </Info>
 *     </div>
 *     <input className="usa-input" id="buffer-distance" aria-describedby="buffer-distance-info" />
 */
export function Info({ id, about, children }: InfoProps) {
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  // The bubble shows while the pointer rests on the element, and while the button holds it open: after the
  // keyboard has brought the focus to the button, and after the button was pressed.
  const [hovered, setHovered] = useState(false);
  const [held, setHeld] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const open = hovered || held;

  // The bubble keeps its size while it is not shown, so its place is known before it shows.
  const findPlace = () => setPlace(placeOf(button.current, bubble.current));

  const hold = () => {
    findPlace();
    setHeld(true);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    // The Escape key hides the bubble wherever the keyboard focus is, and does nothing else: the pane or the
    // dialog that holds the button does not receive the key.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setHovered(false);
        setHeld(false);
      }
    };
    // A press outside the button and its bubble ends what a press on the button began.
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !button.current?.parentElement?.contains(event.target)) {
        setHeld(false);
      }
    };
    // The bubble follows its button when the pane scrolls or the window changes its size.
    const follow = () => setPlace(placeOf(button.current, bubble.current));
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  return (
    <span
      className="info"
      // A finger does not rest on an element: on a touch screen the press shows the bubble.
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") {
          findPlace();
          setHovered(true);
        }
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        ref={button}
        type="button"
        className="info-button"
        aria-label={`Information about ${about}`}
        aria-describedby={id}
        // The bubble shows when the keyboard brings the focus, and not when the focus returns to the button
        // after a pane or a dialog is closed with the pointer.
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) {
            hold();
          }
        }}
        onBlur={() => setHeld(false)}
        onClick={hold}
      >
        <Icon name="info_outline" />
      </button>
      <span
        ref={bubble}
        role="tooltip"
        className={open ? "info-bubble info-bubble--open" : "info-bubble"}
        style={open && place ? { left: place.left, top: place.top } : undefined}
      >
        <span className="info-bubble-text" id={id}>
          {children}
        </span>
      </span>
    </span>
  );
}
