import ScaleLine from "ol/control/ScaleLine";
import type OlMap from "ol/Map";
import { useCallback, useState, useSyncExternalStore } from "react";

/** Return the scale bar among the controls of the map, or null when the map shows none. */
export function findScaleBar(map: OlMap): ScaleLine | null {
  return (
    map
      .getControls()
      .getArray()
      .find((control): control is ScaleLine => control instanceof ScaleLine) ?? null
  );
}

/**
 * The scale bar of the map, for the button that shows and hides it. Return null when the map was made without a
 * scale bar. The bar that is hidden is kept, so that the same one is shown again.
 */
export function useScaleBar(map: OlMap): { shown: boolean; toggle: () => void } | null {
  const [hidden, setHidden] = useState<ScaleLine | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => {
      const controls = map.getControls();
      controls.on(["add", "remove"], listener);
      return () => controls.un(["add", "remove"], listener);
    },
    [map],
  );
  const shown = useSyncExternalStore(subscribe, () => findScaleBar(map));

  if (!shown && !hidden) {
    return null;
  }
  return {
    shown: shown !== null,
    toggle: () => {
      if (shown) {
        map.removeControl(shown);
        setHidden(shown);
      } else if (hidden) {
        map.addControl(hidden);
        setHidden(null);
      }
    },
  };
}
