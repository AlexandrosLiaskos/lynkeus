import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { toolStore } from "./state";

/**
 * The cross in the centre of the map. It shows while a tool is in use and the map has the keyboard focus: the
 * arrow keys move the map under it, and the Enter key acts at its place, so a tool can be used without a pointer.
 */
export function ToolCross() {
  const map = useMap();
  const tool = useStore(toolStore);

  useEffect(() => {
    map.getViewport()?.classList.toggle("map-tool", tool !== null);
  }, [map, tool]);

  const container = map.getOverlayContainer();
  return container ? createPortal(<div className="map-cross" aria-hidden="true" />, container) : null;
}
