// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useRef, useState, type DOMAttributes, type ReactElement } from "react";
import { Focusable, TooltipTrigger } from "react-aria-components";
import { Bubble, GAP } from "./Bubble";

/** The time that the pointer rests on an element before its description shows, in milliseconds. */
export const HOVER_DELAY = 500;

/**
 * The time that a description stays after the pointer has left its element, in milliseconds. The pointer crosses
 * from the element onto the description in this time.
 */
export const LEAVE_DELAY = 500;

interface TooltipProps {
  /** Name of the element. */
  title: string;
  /** One sentence on what the element does. An element whose name says it all, such as an icon button, has none. */
  text?: string;
  /** A second sentence, for example the reason why the element is inactive. */
  note?: string;
  /**
   * The element that is described: one element that can take the focus, such as a button. It receives the id of
   * the description for its `aria-describedby` attribute.
   */
  children: (describedBy: string) => ReactElement<DOMAttributes<Element>, string>;
}

/** Return how far the row of an element reaches under the element, in pixels, or zero for an element without a row. */
function reachOfRow(element: Element | null): number {
  const row = element?.closest("[data-tooltip-row]");
  if (!element || !row) {
    return 0;
  }
  return Math.max(0, row.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom);
}

/**
 * The description of a button, or the name alone of a button that shows only an icon. It shows under the button
 * after the pointer has rested on it and while the button has keyboard focus. The Escape key hides it, and the
 * pointer may move onto it without hiding it, as the criterion 1.4.13 of the Web Content Accessibility Guidelines
 * asks.
 *
 * `TooltipTrigger` of React Aria Components times the pointer, follows the focus, and hides the description at the
 * Escape key, at a press and half a second after the pointer has left. While a description shows, the Escape key
 * hides it and reaches nothing else. `Bubble` places the description.
 *
 * The sentences of the description are in the page at all times, in an element that is not shown, so the button
 * that carries its id in `aria-describedby` is described also while the description is not shown.
 *
 * An element that holds the button may carry the attribute `data-tooltip-row`. The description then shows under
 * that element, so that it does not cover what the element shows under the button, as the ribbon shows the name
 * of a group.
 */
export function Tooltip({ title, text, note, children }: TooltipProps) {
  const id = useId();
  const element = useRef<HTMLElement>(null);
  const [reach, setReach] = useState(0);
  const sentences =
    text === undefined && note === undefined ? null : (
      <>
        {text}
        {note ? ` ${note}` : null}
      </>
    );

  return (
    <span className="tooltip-anchor">
      <TooltipTrigger
        delay={HOVER_DELAY}
        closeDelay={LEAVE_DELAY}
        onOpenChange={(open) => {
          if (open) {
            setReach(reachOfRow(element.current));
          }
        }}
      >
        <Focusable ref={element}>{children(id)}</Focusable>
        <Bubble className="tooltip" offset={GAP + reach}>
          <strong className="tooltip-title">{title}</strong>
          {sentences ? <span>{sentences}</span> : null}
        </Bubble>
      </TooltipTrigger>
      {sentences ? (
        <span id={id} hidden>
          {sentences}
        </span>
      ) : null}
    </span>
  );
}
