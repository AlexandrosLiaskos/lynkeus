import { useEffect, useRef, useState, type DragEvent } from "react";
import { mapLayersStore } from "../shared/mapLayers";
import { Pane } from "../shared/pane/Pane";
import { useStore } from "../shared/store";
import { BackgroundMaps } from "./BackgroundMaps";
import { LayerItem, nameButtonId } from "./LayerItem";
import { listedLayers, placeLayer, placeOf } from "./order";
import { useLayerDrawing } from "./useLayerDrawing";

/** Where a dragged layer would be put: above or below the layer with this id. */
interface Drop {
  id: string;
  side: "above" | "below";
}

/** The layers of the map, the top layer first. A layer is moved by dragging it, by its menu or by the keyboard. */
function Layers() {
  const layers = listedLayers(useStore(mapLayersStore));
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [said, setSaid] = useState("");
  const focus = useRef<string | null>(null);

  // After a layer has moved, the focus returns to its name, which the browser may have lost with the move.
  useEffect(() => {
    if (focus.current !== null) {
      document.getElementById(focus.current)?.focus();
      focus.current = null;
    }
  });

  const say = (id: string) => {
    const title = layers.find((layer) => layer.id === id)?.title ?? "";
    setSaid(`${title} is at place ${String(placeOf(id) + 1)} of ${String(layers.length)}.`);
  };

  const onMoved = (id: string) => {
    focus.current = nameButtonId(id);
    say(id);
  };

  const onRemoved = (place: number) => {
    const next = layers.filter((_, index) => index !== place)[Math.min(place, layers.length - 2)];
    focus.current = next ? nameButtonId(next.id) : "contents-empty";
    setSaid("The layer was removed.");
  };

  const endDrag = () => {
    setDragged(null);
    setDrop(null);
  };

  const onDragOver = (id: string) => (event: DragEvent) => {
    if (dragged === null) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const { top, height } = event.currentTarget.getBoundingClientRect();
    const side = event.clientY < top + height / 2 ? "above" : "below";
    if (drop?.id !== id || drop.side !== side) {
      setDrop({ id, side });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    if (dragged !== null && drop && drop.id !== dragged) {
      const others = layers.filter((layer) => layer.id !== dragged);
      const target = others.findIndex((layer) => layer.id === drop.id);
      placeLayer(dragged, drop.side === "above" ? target : target + 1);
      say(dragged);
    }
    endDrag();
  };

  return (
    <>
      {layers.length === 0 ? (
        <p className="contents-empty" id="contents-empty" tabIndex={-1}>
          The map has no layers. A layer that you receive with Get layer on the Data tab, and the result of a tool of
          the Analysis tab, are listed here.
        </p>
      ) : (
        <ul className="contents-list" aria-label="Layers, the top layer first">
          {layers.map((layer, place) => (
            <LayerItem
              key={layer.id}
              layer={layer}
              place={place}
              count={layers.length}
              drop={drop?.id === layer.id && dragged !== layer.id ? drop.side : null}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", layer.title);
                event.dataTransfer.effectAllowed = "move";
                setDragged(layer.id);
              }}
              onDragOver={onDragOver(layer.id)}
              onDrop={onDrop}
              onDragEnd={endDrag}
              onMoved={onMoved}
              onRemoved={onRemoved}
            />
          ))}
        </ul>
      )}
      <p className="usa-sr-only" role="status">
        {said}
      </p>
    </>
  );
}

/**
 * The Contents pane, on the left of the map: the layers of the map in drawing order, with the top layer first
 * and the background maps last. The layers are drawn on the map whether the pane is open or closed.
 */
export function ContentsPane() {
  useLayerDrawing();
  return (
    <Pane id="contents" title="Contents">
      <h3 className="contents-heading">Drawing order</h3>
      <Layers />
      <h3 className="contents-heading">Background maps</h3>
      <BackgroundMaps />
    </Pane>
  );
}
