// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { accountOf, useSession } from "../data/session";
import { SIGN_IN_PANE } from "../data/SignInPane";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { Notice } from "../shared/notice/Notice";
import { Pane } from "../shared/pane/Pane";
import { layerOrderStore, shapeLayersStore, type ShapeLayer } from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { BasemapItem, MAP_ROW_ID } from "./BasemapItem";
import { forgetKept, keptStore, statesStore, type KeptLayer, type LayerState } from "./kept";
import { idsIn, noAnswerWords, STATE_COMMANDS, waitingGroups, waitsWords } from "./keptWords";
import { LayerItem, nameButtonId, type LayerRowProps } from "./LayerItem";
import { listedLayers, placeLayer, placeOf } from "./order";
import { RemovedLayerItem } from "./RemovedLayerItem";
import { ShapeLayerItem } from "./ShapeLayerItem";
// The layers of the map are kept in the browser from the moment at which the Contents pane is loaded.
import "./storedLayers";
import { useLayerDrawing } from "./useLayerDrawing";

/**
 * A row of the list: a layer of `mapLayersStore`, a shape layer that another part of the interface draws, or a
 * layer that the browser keeps for the map and the server has removed.
 */
export type ListedLayer =
  | { id: string; title: string; layer: LayerDescription }
  | { id: string; title: string; shape: ShapeLayer }
  | { id: string; title: string; removed: KeptLayer };

/**
 * Return the rows of the list of the Contents pane, the top layer first: the layers of the drawing order, each
 * with its description. An id of the order that neither kind of layer carries has no row.
 */
export function listedRows(
  order: readonly string[],
  layers: readonly LayerDescription[],
  shapes: readonly ShapeLayer[],
): ListedLayer[] {
  return listedLayers(order).flatMap((id): ListedLayer[] => {
    const layer = layers.find((other) => other.id === id);
    if (layer) {
      return [{ id, title: layer.title, layer }];
    }
    const shape = shapes.find((other) => other.id === id);
    return shape ? [{ id, title: shape.title, shape }] : [];
  });
}

/**
 * Return the rows of the list with the layers that the server removed, each at the place that it had on the
 * map: directly above the nearest kept layer under it that the list shows, or at the bottom of the list when
 * there is none. The rows are given and returned with the top layer first; the kept layers stand in drawing
 * order, the bottom layer first.
 */
export function withRemoved(
  rows: readonly ListedLayer[],
  kept: readonly KeptLayer[],
  states: Readonly<Record<string, LayerState>>,
): ListedLayer[] {
  const listed = [...rows];
  kept.forEach((entry, index) => {
    const { id, title } = entry.layer;
    if (states[id] !== "removed" || listed.some((row) => row.id === id)) {
      return;
    }
    const under = kept
      .slice(0, index)
      .reverse()
      .find((other) => listed.some((row) => row.id === other.layer.id));
    const place = under ? listed.findIndex((row) => row.id === under.layer.id) : listed.length;
    listed.splice(place, 0, { id, title, removed: entry });
  });
  return listed;
}

/**
 * The states of the kept layers that are not on the map and have no row, over the list (`docs/Storage.md`,
 * States of a stored layer): one notice for the layers about which the project server does not answer, and one
 * for the layers of each account that wait for the sign-in. A visitor who is not signed in is offered the
 * sign-in. A visitor who is signed in to another account is offered to remove the layers from this browser.
 */
function StateNotices() {
  const kept = useStore(keptStore);
  const states = useStore(statesStore);
  const user = accountOf(useSession());
  const silent = idsIn(kept, states, "no-answer");
  const waiting = waitingGroups(kept, states);
  if (silent.length === 0 && waiting.length === 0) {
    return null;
  }
  return (
    <div className="contents-notices">
      {silent.length > 0 ? <Notice kind="warning">{noAnswerWords(silent.length)}</Notice> : null}
      {waiting.map(({ account, ids }) => (
        <Notice
          key={account ?? ""}
          kind="info"
          action={
            user === null
              ? { label: STATE_COMMANDS.signIn, onClick: () => openToolPane(SIGN_IN_PANE) }
              : { label: STATE_COMMANDS.removeFromBrowser, onClick: () => forgetKept(ids) }
          }
        >
          {waitsWords(ids.length, account, user)}
        </Notice>
      ))}
    </div>
  );
}

/** Where a dragged layer would be put: above or below the layer with this id. */
interface Drop {
  id: string;
  side: "above" | "below";
}

/**
 * The layers of the map, the top layer first and the basemap last: the layers of `mapLayersStore` and the shape
 * layers, in the one drawing order of the map. A layer of either kind is moved by dragging it, by its menu or by
 * the keyboard, also across a layer of the other kind. The basemap stays at the bottom. A layer that the browser
 * keeps for the map and the server has removed has a row at its place, which says so, and the layers that wait
 * for the sign-in are stated in a notice over the list.
 */
function Layers() {
  const layers = listedRows(useStore(layerOrderStore), useStore(mapLayersStore), useStore(shapeLayersStore));
  // The layers that the server removed stand among the others, and no command moves them.
  const rows = withRemoved(layers, useStore(keptStore), useStore(statesStore));
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
    focus.current = next ? nameButtonId(next.id) : MAP_ROW_ID;
    setSaid("The layer was removed.");
  };

  const onForgotten = (id: string) => {
    const place = rows.findIndex((row) => row.id === id);
    const next = rows.filter((row) => row.id !== id)[Math.min(place, rows.length - 2)];
    focus.current = next ? nameButtonId(next.id) : MAP_ROW_ID;
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
      <StateNotices />
      <ul className="contents-list" aria-label="Layers, the top layer first">
        {rows.map((row) => {
          const { id, title } = row;
          if ("removed" in row) {
            return <RemovedLayerItem key={id} kept={row.removed} onForgotten={onForgotten} />;
          }
          const place = layers.findIndex((other) => other.id === id);
          const common: LayerRowProps = {
            place,
            count: layers.length,
            drop: drop?.id === id && dragged !== id ? drop.side : null,
            onDragStart: (event) => {
              event.dataTransfer.setData("text/plain", title);
              event.dataTransfer.effectAllowed = "move";
              setDragged(id);
            },
            onDragOver: onDragOver(id),
            onDrop,
            onDragEnd: endDrag,
            onMoved,
            onRemoved,
          };
          return "layer" in row ? (
            <LayerItem key={id} layer={row.layer} {...common} />
          ) : (
            <ShapeLayerItem key={id} layer={row.shape} {...common} />
          );
        })}
        <BasemapItem />
      </ul>
      <p className="usa-sr-only" role="status">
        {said}
      </p>
    </>
  );
}

/**
 * The Contents pane, on the left of the map, as in ArcGIS Pro: the map and, under it, its layers in drawing order,
 * with the top layer first and the basemap last. The shapes that other parts of the interface draw, such as the
 * area and the outlines of the products found, are layers of the same list. The row of the map folds and unfolds
 * the list. The rows reach
 * the two edges of the pane, so that the selected layer is marked over the whole width. The layers are drawn on
 * the map whether the pane is open or closed.
 */
export function ContentsPane() {
  useLayerDrawing();
  const [folded, setFolded] = useState(false);
  const layersId = useId();
  return (
    <Pane id="contents" title="Contents">
      <div className="pane-bleed">
        <button
          type="button"
          id={MAP_ROW_ID}
          className="contents-map"
          aria-expanded={!folded}
          aria-controls={layersId}
          onClick={() => setFolded(!folded)}
        >
          <Icon name="expand_more" />
          <Icon name="map" />
          <span>Map</span>
        </button>
        <div id={layersId} hidden={folded}>
          <Layers />
        </div>
      </div>
    </Pane>
  );
}
