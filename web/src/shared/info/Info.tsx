// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useState, type ReactNode } from "react";
import { Focusable, TooltipTrigger } from "react-aria-components";
import { Icon } from "../icon/Icon";
import { Bubble } from "../tooltip/Bubble";
import { LEAVE_DELAY } from "../tooltip/Tooltip";

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

/**
 * The explanation of a title, behind a small circled "i" that stands beside the title, as the information
 * button beside a parameter in the Geoprocessing pane of ArcGIS Pro. The explanation shows in a bubble while the
 * pointer rests on the button or on the bubble, while the button has keyboard focus, and after the button is
 * pressed, which is how a touch screen shows it. The Escape key hides the bubble and reaches nothing else. The
 * criterion 1.4.13 of the Web Content Accessibility Guidelines asks for these things.
 *
 * `TooltipTrigger` of React Aria Components follows the pointer and the focus. It hides the bubble at the Escape
 * key, when the focus leaves the button, and half a second after the pointer has left the button and the bubble.
 * `Bubble` places the bubble.
 *
 * The explanation is in the page at all times, in an element that is not shown, so the element that carries its
 * id in `aria-describedby` is described by it also while the bubble is not shown.
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
  const [open, setOpen] = useState(false);

  return (
    <span className="info">
      {/* The bubble shows as soon as the pointer is on the button, and a press does not hide it. */}
      <TooltipTrigger
        delay={0}
        closeDelay={LEAVE_DELAY}
        shouldCloseOnPress={false}
        isOpen={open}
        onOpenChange={setOpen}
      >
        <Focusable>
          <button
            type="button"
            className={open ? "info-button info-button--open" : "info-button"}
            aria-label={`Information about ${about}`}
            aria-describedby={id}
            // A finger does not rest on an element: on a touch screen the press shows the bubble.
            onClick={() => setOpen(true)}
          >
            <Icon name="info_outline" />
          </button>
        </Focusable>
        <Bubble className="info-bubble">{children}</Bubble>
      </TooltipTrigger>
      <span id={id} hidden>
        {children}
      </span>
    </span>
  );
}
