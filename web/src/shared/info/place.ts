/** The edges of an element in the window, in pixels, as `getBoundingClientRect` gives them. */
export interface Edges {
  left: number;
  top: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The place of a bubble in the window, in pixels, and whether it stands above its element. */
export interface Place {
  left: number;
  top: number;
  above: boolean;
}

/** The smallest distance between a bubble and an edge of the window, in pixels. The style file gives the same value. */
export const WINDOW_MARGIN = 8;

/**
 * Return the place of a bubble beside an element, so that the whole bubble stays inside the window. The bubble
 * stands under the element and starts at its left edge. It moves to the left when it would cross the right edge
 * of the window, and it stands above the element when it would cross the lower edge and has room above.
 */
export function placeBubble(element: Edges, bubble: Size, window: Size): Place {
  const fitsUnder = element.bottom + bubble.height + WINDOW_MARGIN <= window.height;
  const fitsAbove = element.top - bubble.height >= WINDOW_MARGIN;
  const above = !fitsUnder && fitsAbove;
  const furthestLeft = window.width - bubble.width - WINDOW_MARGIN;
  return {
    left: Math.round(Math.max(WINDOW_MARGIN, Math.min(element.left, furthestLeft))),
    top: Math.round(above ? element.top - bubble.height : element.bottom),
    above,
  };
}
