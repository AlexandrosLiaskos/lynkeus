import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import type Layer from "ol/layer/Layer";
import { getRenderPixel } from "ol/render";
import type RenderEvent from "ol/render/Event";
import { createStore } from "../shared/store";

/** The swipe line stands upright and moves left and right, or lies level and moves up and down. */
export type SwipeLine = "upright" | "level";

export interface Swipe {
  on: boolean;
  line: SwipeLine;
  /**
   * The share of the map that the swiped layer covers, in percent: its width from the left edge up to an upright
   * line, or its height from the bottom edge up to a level line.
   */
  share: number;
}

/** The state of the Swipe tool. The line starts in the middle of the map. */
export const swipeStore = createStore<Swipe>({ on: false, line: "upright", share: 50 });

/** The steps of the line for the arrow keys and for the Page Up and Page Down keys, in percent. */
const STEP = 1;
const LARGE_STEP = 10;

/**
 * Return the share after a key is pressed on the line, or undefined for a key that does not move it. The keys
 * are those of the slider pattern of the ARIA Authoring Practices Guide: the right and up arrows increase the
 * value and the left and down arrows decrease it, Page Up and Page Down change it by a larger step, and Home and
 * End set its lowest and its highest value. So the arrows move an upright line to the right and to the left, and
 * a level line up and down.
 */
export function shareAfterKey(share: number, key: string): number | undefined {
  const moved = (
    {
      ArrowRight: STEP,
      ArrowUp: STEP,
      ArrowLeft: -STEP,
      ArrowDown: -STEP,
      PageUp: LARGE_STEP,
      PageDown: -LARGE_STEP,
    } as Partial<Record<string, number>>
  )[key];
  if (moved !== undefined) {
    return Math.min(100, Math.max(0, share + moved));
  }
  return key === "Home" ? 0 : key === "End" ? 100 : undefined;
}

/**
 * Return the part of the map in which the swiped layer is drawn, as left, top, width and height in pixels: the
 * part on the left of an upright line, or under a level line. The other part shows what lies below the layer in
 * the drawing order.
 */
export function swipePart(
  [width, height]: readonly [number, number],
  { line, share }: Swipe,
): [number, number, number, number] {
  return line === "upright"
    ? [0, 0, (width * share) / 100, height]
    : [0, height - (height * share) / 100, width, (height * share) / 100];
}

/** Tell whether a layer is drawn with WebGL. Otherwise it is drawn on a canvas in two dimensions. */
function isWebGl(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | WebGLRenderingContext,
): context is WebGLRenderingContext {
  return "scissor" in context;
}

/**
 * Draw a layer only in the part of the map that the swipe line leaves to it, until the function returned is
 * called. A layer that OpenLayers draws with WebGL is cut with the scissor of WebGL, and a layer that it draws
 * on a canvas with a clip path, as the layer swipe examples of OpenLayers do.
 */
export function clipLayer(map: OlMap, layer: Layer, swipe: () => Swipe): () => void {
  const before = (event: RenderEvent) => {
    const size = map.getSize();
    const context = event.context;
    if (!size || !context) {
      return;
    }
    const [left, top, width, height] = swipePart([size[0] ?? 0, size[1] ?? 0], swipe());
    if (!isWebGl(context)) {
      const corners = [
        [left, top],
        [left, top + height],
        [left + width, top + height],
        [left + width, top],
      ].map((corner) => getRenderPixel(event, corner));
      context.save();
      context.beginPath();
      corners.forEach(([x = 0, y = 0], index) => {
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.clip();
    } else {
      // The scissor of WebGL takes its rectangle from the bottom left corner.
      const [x1 = 0, y1 = 0] = getRenderPixel(event, [left, top + height]);
      const [x2 = 0, y2 = 0] = getRenderPixel(event, [left + width, top]);
      context.enable(context.SCISSOR_TEST);
      context.scissor(x1, y1, Math.max(0, x2 - x1), Math.max(0, y2 - y1));
    }
  };
  const after = (event: RenderEvent) => {
    const context = event.context;
    if (context && isWebGl(context)) {
      context.disable(context.SCISSOR_TEST);
    } else {
      context?.restore();
    }
  };
  const keys = [layer.on("prerender", before), layer.on("postrender", after)];
  map.render();
  return () => {
    unByKey(keys);
    map.render();
  };
}
