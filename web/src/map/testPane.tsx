import { act, render } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import type { ReactNode } from "react";
import { openToolPane } from "../shared/dock/dock";
import { MapContext } from "../shared/map";

/**
 * Draw a pane of the Map tab beside a map of 800 by 600 pixels that shows the lower Merrimack River, and open
 * it, as its ribbon button does. The tests of the panes use it.
 */
export function openPane(id: string, pane: ReactNode): OlMap {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
  map.setSize([800, 600]);
  render(<MapContext value={map}>{pane}</MapContext>);
  act(() => openToolPane(id));
  return map;
}
