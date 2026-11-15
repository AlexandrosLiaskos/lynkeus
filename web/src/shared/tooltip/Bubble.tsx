// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useState, type ReactNode } from "react";
import { Tooltip as AriaTooltip } from "react-aria-components";

/** The clear strip between an element, or its row, and its bubble, in pixels. */
export const GAP = 4;

/** The smallest distance between a bubble and an edge of the window, in pixels. */
export const WINDOW_MARGIN = 8;

interface BubbleProps {
  /** The class of the bubble, which gives it its look. */
  className: string;
  /** The distance between the element and the bubble, in pixels. */
  offset?: number;
  children: ReactNode;
}

/**
 * The bubble of a `TooltipTrigger` of React Aria Components: the description of a button and the explanation of a
 * title. The library places it under the element of the trigger, from the left edge of the element. It keeps the
 * bubble 8 pixels inside the window, and shows it above the element when it has no room under it.
 *
 * The library draws a bubble at the end of the page by default. A dialog of this application is the `dialog`
 * element of the browser, which shows over everything that stands outside it, so a bubble at the end of the page
 * would stay under the dialog. The bubble is therefore drawn in a layer that stands beside its element (see
 * `.bubble-layer`). The library passes the layer with the property `UNSTABLE_portalContainer`. The library marks it
 * as deprecated in favour of `UNSAFE_PortalProvider` of the package `react-aria`, which the interface does not
 * depend on by itself.
 */
export function Bubble({ className, offset = GAP, children }: BubbleProps) {
  const [layer, setLayer] = useState<HTMLSpanElement | null>(null);

  return (
    <>
      <span ref={setLayer} className="bubble-layer" />
      <AriaTooltip
        className={className}
        placement="bottom start"
        offset={offset}
        containerPadding={WINDOW_MARGIN}
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- See the comment of this component.
        UNSTABLE_portalContainer={layer ?? undefined}
      >
        {children}
      </AriaTooltip>
    </>
  );
}
