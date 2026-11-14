import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import type { Pixel } from "ol/pixel";
import { useEffect, useState } from "react";
import { valueAt } from "../contents/display";

/**
 * Write a value of a layer with six significant figures. The files hold numbers of 32 bits, which carry seven
 * significant figures, so every figure written comes from the file.
 */
export function formatValue(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/** The widest text that `formatValue` gives. */
export const WIDEST_VALUE = "-8.88888e-88";

/** Return the pixel at the centre of the map, or null for a map that is not on the page. */
export function centrePixel(map: OlMap): Pixel | null {
  const [width, height] = map.getSize() ?? [];
  return width === undefined || height === undefined ? null : [width / 2, height / 2];
}

/**
 * The value of a layer at a pixel of the map, or at the centre of the map when no pixel is given. The value is
 * null where the layer has no data or is not drawn. It is read at most once for each frame that the browser
 * draws, so that the map stays smooth while the pointer moves, and again whenever the map has finished drawing,
 * because the file of the layer arrives in parts.
 */
export function useLayerValue(map: OlMap, id: string | null, pixel: Pixel | null): number | null {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    if (id === null) {
      return;
    }
    let frame = 0;
    const read = () => {
      frame = 0;
      const place = pixel ?? centrePixel(map);
      setValue(place ? valueAt(map, id, place) : null);
    };
    const ask = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(read);
      }
    };
    ask();
    const key = map.on("rendercomplete", ask);
    return () => {
      cancelAnimationFrame(frame);
      unByKey(key);
    };
  }, [map, id, pixel]);

  return id === null ? null : value;
}
