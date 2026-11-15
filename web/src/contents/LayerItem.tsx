import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import type { LayerDescription } from "../shared/layer";
import { useMap } from "../shared/map";
import { MenuButton } from "../shared/menu/MenuButton";
import { Notice } from "../shared/notice/Notice";
import { useStore } from "../shared/store";
import { formatDates } from "./dates";
import { extentOf } from "./display";
import { layerProblemsStore } from "./drawing";
import { Legend } from "./Legend";
import { Menu, type MenuItem } from "./Menu";
import { moveLayer, removeLayer, renameLayer, type Move } from "./order";
import { inDecibels, isLinearPower } from "./scaling";
import {
  copiedDisplayStore,
  copyDisplay,
  displayStore,
  firstDisplay,
  foldedStore,
  pasteDisplay,
  propertiesStore,
  selectedLayerStore,
  setDisplay,
  setFolded,
  symbologyStore,
  SYMBOLOGY_PANE,
} from "./state";

/** The space kept around a layer when the map zooms to it, in pixels. */
const SPACE_AROUND = 24;

interface LayerItemProps {
  layer: LayerDescription;
  /** Place of the layer in the list, from 0 for the top layer, and the number of layers. */
  place: number;
  count: number;
  /** Where a dragged layer would be put: above or below this one. */
  drop: "above" | "below" | null;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
  /** Called after a command has moved the layer. */
  onMoved: (id: string) => void;
  /** Called after the layer was removed. */
  onRemoved: (place: number) => void;
}

/** Return the id of the button that carries the name of a layer, for moving the focus to it. */
export function nameButtonId(id: string): string {
  return `contents-name-${id}`;
}

/**
 * One layer of the Contents pane. Its row holds the arrow that folds its legend, the box that shows or hides it,
 * its name with its dates, which selects it, and the button of its menu. Under the row stand its legend and its
 * opacity, or a notice when its file could not be read. The right mouse button opens the same menu at the pointer.
 */
export function LayerItem({ layer, place, count, drop, onMoved, onRemoved, ...drag }: LayerItemProps) {
  const map = useMap();
  const display = useStore(displayStore)[layer.id] ?? firstDisplay(layer);
  const selected = useStore(selectedLayerStore) === layer.id;
  const folded = useStore(foldedStore).includes(layer.id);
  const problem = useStore(layerProblemsStore)[layer.id];
  const copied = useStore(copiedDisplayStore);
  const [renaming, setRenaming] = useState(false);
  const refocus = useRef(false);
  const renamed = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const detailsId = useId();
  const opacityId = useId();
  const percent = Math.round(display.opacity * 100);

  const move = (direction: Move) => {
    moveLayer(layer.id, direction);
    onMoved(layer.id);
  };

  const zoom = () => {
    void extentOf(map, layer.id).then((extent) => {
      if (extent) {
        map.getView().fit(extent, { padding: Array<number>(4).fill(SPACE_AROUND), duration: 250 });
      }
    });
  };

  const remove = () => {
    removeLayer(layer.id);
    onRemoved(place);
  };

  // The focus returns to the name after the field for a new name has closed.
  useEffect(() => {
    if (!renaming && refocus.current) {
      refocus.current = false;
      document.getElementById(nameButtonId(layer.id))?.focus();
    }
  }, [renaming, layer.id]);

  // The field closes once: the Enter key, the Escape key or the loss of the focus ends it, whichever comes first.
  const endRenaming = (title: string | null) => {
    if (renamed.current) {
      return;
    }
    renamed.current = true;
    if (title !== null) {
      renameLayer(layer.id, title);
    }
    refocus.current = true;
    setRenaming(false);
  };

  // A field that has just opened has not closed yet.
  useEffect(() => {
    if (renaming) {
      renamed.current = false;
    }
  }, [renaming]);

  const startRenaming = () => {
    setRenaming(true);
  };

  const openSymbology = () => {
    symbologyStore.set({ id: layer.id, time: Date.now() });
    openToolPane(SYMBOLOGY_PANE);
  };

  const items: MenuItem[] = [
    { id: "zoom", label: "Zoom to layer", disabled: problem !== undefined, run: zoom },
    { id: "up", label: "Move up", disabled: place === 0, separated: true, run: () => move("up") },
    { id: "down", label: "Move down", disabled: place === count - 1, run: () => move("down") },
    { id: "top", label: "Move to top", disabled: place === 0, run: () => move("top") },
    { id: "bottom", label: "Move to bottom", disabled: place === count - 1, run: () => move("bottom") },
    { id: "rename", label: "Rename", separated: true, run: startRenaming },
    { id: "remove", label: "Remove", run: remove },
    ...(isLinearPower(layer)
      ? [
          {
            id: "decibels",
            label: "Show in decibels",
            checked: inDecibels(layer, display),
            disabled: display.range[0] <= 0,
            separated: true,
            run: () => setDisplay(layer, { decibels: !inDecibels(layer, display) }),
          },
        ]
      : []),
    { id: "copy", label: "Copy display", separated: !isLinearPower(layer), run: () => copyDisplay(layer) },
    { id: "paste", label: "Paste display", disabled: copied === null, run: () => pasteDisplay(layer) },
    { id: "symbology", label: "Symbology", disabled: problem !== undefined, separated: true, run: openSymbology },
    {
      id: "properties",
      label: "Properties",
      run: () => propertiesStore.set({ id: layer.id, time: Date.now() }),
    },
  ];

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  // With the focus on the name, Alt and an arrow key move the layer, F2 opens the field for a new name and
  // Delete removes the layer.
  const onNameKey = (event: KeyboardEvent) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(event.key === "ArrowUp" ? "up" : "down");
    } else if (event.key === "F2") {
      event.preventDefault();
      startRenaming();
    } else if (event.key === "Delete") {
      event.preventDefault();
      remove();
    }
  };

  // In the field for a new name, Enter takes the name and Escape keeps the old one.
  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      endRenaming(event.currentTarget.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      endRenaming(null);
    }
  };

  // The menu at the pointer has no button of its own, so the focus returns to the name of the layer.
  const closeMenu = (refocus: boolean) => {
    setMenu(null);
    if (refocus) {
      document.getElementById(nameButtonId(layer.id))?.focus();
    }
  };

  return (
    <li
      className={`contents-layer${selected ? " contents-layer--selected" : ""}${drop ? ` contents-layer--drop-${drop}` : ""}`}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
    >
      <div
        className="contents-row"
        draggable={!renaming}
        onDragStart={drag.onDragStart}
        onDragEnd={drag.onDragEnd}
        onContextMenu={onContextMenu}
      >
        <button
          type="button"
          className="contents-fold"
          aria-expanded={!folded}
          aria-controls={detailsId}
          aria-label={`Legend of ${layer.title}`}
          onClick={() => setFolded(layer.id, !folded)}
        >
          <Icon name="expand_more" />
        </button>
        <label className="contents-visible">
          <input
            type="checkbox"
            checked={display.visible}
            aria-label={`Show ${layer.title}`}
            onChange={(event) => setDisplay(layer, { visible: event.target.checked })}
          />
        </label>
        {renaming ? (
          <input
            className="contents-rename"
            aria-label={`New name of ${layer.title}`}
            defaultValue={layer.title}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={onRenameKey}
            onBlur={(event) => endRenaming(event.currentTarget.value)}
          />
        ) : (
          <button
            type="button"
            id={nameButtonId(layer.id)}
            className="contents-name"
            aria-pressed={selected}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown F2 Delete"
            onClick={() => selectedLayerStore.set(selected ? null : layer.id)}
            onKeyDown={onNameKey}
          >
            <span className="item-title">{layer.title}</span>{" "}
            <span className="item-line">{formatDates(layer.dates)}</span>
          </button>
        )}
        <MenuButton
          icon="more_vert"
          label={`Commands of ${layer.title}`}
          items={items.map(({ label, run, disabled, checked, separated }) => ({
            label,
            onSelect: run,
            disabled,
            checked,
            separated,
          }))}
        />
      </div>
      <div className="contents-details" id={detailsId} hidden={folded}>
        {problem === undefined ? (
          <>
            <Legend layer={layer} />
            <div className="contents-opacity">
              <label htmlFor={opacityId}>Opacity</label>
              <input
                id={opacityId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={percent}
                aria-valuetext={`${String(percent)} percent`}
                onChange={(event) => setDisplay(layer, { opacity: Number(event.target.value) / 100 })}
              />
              <span aria-hidden="true">{percent} %</span>
            </div>
          </>
        ) : (
          <Notice kind="error" action={{ label: "Remove layer", onClick: remove }}>
            {problem}
          </Notice>
        )}
      </div>
      {menu && <Menu label={`Commands of ${layer.title}`} items={items} at={menu} focus="first" onClose={closeMenu} />}
    </li>
  );
}
