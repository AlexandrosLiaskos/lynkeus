import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import Layer from "ol/layer/Layer";
import { createPortal } from "react-dom";
import { findLayer } from "../contents/display";
import { selectedLayerStore } from "../contents/state";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { useStore } from "../shared/store";
import { clipLayer, shareAfterKey, swipeStore } from "./swipe";

/**
 * The Swipe tool on the map. While it is on, the selected layer is drawn only on one side of a line, and the
 * other side shows what lies below it in the drawing order. The line is dragged with the pointer or moved with the
 * keys of the slider pattern of the ARIA Authoring Practices Guide.
 */
export function SwipeOnMap() {
  const map = useMap();
  const swipe = useStore(swipeStore);
  const selected = useStore(selectedLayerStore);
  const layers = useStore(mapLayersStore);
  const dragging = useRef(false);
  const title = layers.find(({ id }) => id === selected)?.title;
  const shown = swipe.on && title !== undefined;

  // The layer is found again whenever the layers of the map change, because a layer may be drawn anew.
  useEffect(() => {
    const found = shown && selected ? findLayer(map, selected) : undefined;
    // A layer that draws data, and not a group of layers, tells when it is drawn.
    const layer = found instanceof Layer ? (found as Layer) : undefined;
    return layer ? clipLayer(map, layer, swipeStore.get) : undefined;
  }, [map, shown, selected, layers]);

  useEffect(() => {
    map.render();
  }, [map, swipe]);

  const container = map.getOverlayContainerStopEvent();
  if (!shown || !container) {
    return null;
  }

  const move = (share: number) => swipeStore.set({ ...swipeStore.get(), share: Math.min(100, Math.max(0, share)) });

  const onKeyDown = (event: KeyboardEvent) => {
    const share = shareAfterKey(swipe.share, event.key);
    if (share !== undefined) {
      event.preventDefault();
      move(share);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragging.current) {
      const box = container.getBoundingClientRect();
      move(
        swipe.line === "upright"
          ? ((event.clientX - box.left) / box.width) * 100
          : (1 - (event.clientY - box.top) / box.height) * 100,
      );
    }
  };

  const endDrag = () => {
    dragging.current = false;
  };

  const percent = Math.round(swipe.share);
  return createPortal(
    <div
      className={`swipe swipe--${swipe.line}`}
      style={swipe.line === "upright" ? { left: `${String(swipe.share)}%` } : { top: `${String(100 - swipe.share)}%` }}
      role="slider"
      tabIndex={0}
      aria-label={`Swipe line of ${title}`}
      // An upright line moves left and right, so the slider is horizontal.
      aria-orientation={swipe.line === "upright" ? "horizontal" : "vertical"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${title} covers ${String(percent)} percent of the map, from the ${swipe.line === "upright" ? "left" : "bottom"}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />,
    container,
  );
}
