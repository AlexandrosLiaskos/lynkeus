import type OlMap from "ol/Map";
import type { Coordinate } from "ol/coordinate";

/** A view of the map: its centre and its resolution in the units of the projection, and its rotation in radians. */
export interface ViewState {
  center: Coordinate;
  resolution: number;
  rotation: number;
}

/** The largest number of views that are kept. */
export const HISTORY_LENGTH = 100;

/** The views that the map has shown, in order, with the place of the present view among them. */
export interface ViewHistory {
  /** Record the view that the map shows now. It follows the present view, and the later views are dropped. */
  visit: (view: ViewState) => void;
  /** Go to the view shown before the present one. Returns it, or null when there is none. */
  back: () => ViewState | null;
  /** Go to the view shown after the present one. Returns it, or null when there is none. */
  forward: () => ViewState | null;
}

function same(a: ViewState, b: ViewState): boolean {
  return (
    a.center[0] === b.center[0] &&
    a.center[1] === b.center[1] &&
    a.resolution === b.resolution &&
    a.rotation === b.rotation
  );
}

/** Create an empty list of views. */
export function createViewHistory(): ViewHistory {
  let views: ViewState[] = [];
  let present = -1;
  const go = (step: number) => {
    const view = views[present + step];
    if (!view) {
      return null;
    }
    present += step;
    return view;
  };
  return {
    visit: (view) => {
      const now = views[present];
      if (now && same(now, view)) {
        return;
      }
      views = [...views.slice(Math.max(0, present + 2 - HISTORY_LENGTH), present + 1), view];
      present = views.length - 1;
    },
    back: () => go(-1),
    forward: () => go(1),
  };
}

/** The steps through the views of a map. Each one returns false when there is no view to go to. */
export interface ViewSteps {
  back: () => boolean;
  forward: () => boolean;
}

const steps = new WeakMap<OlMap, ViewSteps>();

/**
 * Return the steps through the views of a map. From the first call on, every view at which the map comes to
 * rest is recorded, as ArcGIS Pro stores every change of the extent.
 */
export function viewStepsOf(map: OlMap): ViewSteps {
  const known = steps.get(map);
  if (known) {
    return known;
  }
  const history = createViewHistory();
  // A view that a step itself has asked for is not recorded again.
  let stepping = false;
  map.on("moveend", () => {
    const view = map.getView();
    const center = view.getCenter();
    const resolution = view.getResolution();
    if (stepping) {
      stepping = false;
    } else if (center && resolution !== undefined) {
      history.visit({ center, resolution, rotation: view.getRotation() });
    }
  });
  const show = (state: ViewState | null) => {
    if (!state) {
      return false;
    }
    stepping = true;
    map.getView().animate({ ...state, duration: 250 });
    return true;
  };
  const created: ViewSteps = { back: () => show(history.back()), forward: () => show(history.forward()) };
  steps.set(map, created);
  return created;
}
