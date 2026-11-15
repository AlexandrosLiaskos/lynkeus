import { memo, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Icon } from "../shared/icon/Icon";
import { useMap } from "../shared/map";
import { MenuButton } from "../shared/menu/MenuButton";
import { Section } from "../shared/section/Section";
import {
  FIRST_SHAPE_DISPLAY,
  setShapeDisplay,
  shapeDisplayStore,
  shapeLayersStore,
  type ShapeLayer,
  type ShapeMembers,
  type ShapeSymbol,
} from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { fitLayer } from "./display";
import { nameButtonId, type LayerRowProps } from "./LayerItem";
import { Menu, type MenuItem } from "./Menu";
import { moveLayer, removeShapeLayer, type Move } from "./order";
import { foldedStore, propertiesStore, selectedLayerStore, setFolded } from "./state";

/** The width and the height of the sample of a symbol, in pixels. */
const SAMPLE = { width: 24, height: 12 };

/** The widest line that a sample draws, in pixels. A wider line of the map is drawn at this width. */
const WIDEST_LINE = 4;

/** By how much the casing of a line is wider than the line, in pixels: one pixel shows on each side. */
const CASING = 2;

/**
 * The sample of one symbol of a shape layer, as the legend draws it beside the label of the symbol. A symbol with
 * a fill is a rectangle that holds the fill, with the line around it; a symbol without one is a line across the
 * sample. The line has its width and its dashes, and its casing is a wider line under it.
 */
export function ShapeSample({ symbol }: { symbol: ShapeSymbol }) {
  const width = Math.min(Math.max(symbol.width, 1), WIDEST_LINE);
  const dashes = symbol.dash?.join(" ");
  const cased = symbol.casing === undefined ? width : width + CASING;
  const middle = SAMPLE.height / 2;
  // The rectangle stands inside the sample by half of its widest line, so that the whole line is drawn.
  const box = { x: cased / 2, y: cased / 2, width: SAMPLE.width - cased, height: SAMPLE.height - cased };
  return (
    <svg
      className="legend-sample"
      viewBox={`0 0 ${String(SAMPLE.width)} ${String(SAMPLE.height)}`}
      aria-hidden="true"
      focusable="false"
    >
      {symbol.fill === undefined ? (
        <>
          {symbol.casing === undefined ? null : (
            <line x1={0} y1={middle} x2={SAMPLE.width} y2={middle} stroke={symbol.casing} strokeWidth={cased} />
          )}
          <line
            x1={0}
            y1={middle}
            x2={SAMPLE.width}
            y2={middle}
            stroke={symbol.line}
            strokeWidth={width}
            strokeDasharray={dashes}
          />
        </>
      ) : (
        <>
          <rect {...box} fill={symbol.fill} />
          {symbol.casing === undefined ? null : (
            <rect {...box} fill="none" stroke={symbol.casing} strokeWidth={cased} />
          )}
          <rect {...box} fill="none" stroke={symbol.line} strokeWidth={width} strokeDasharray={dashes} />
        </>
      )}
    </svg>
  );
}

/** The legend of a shape layer: each of its symbols as a sample beside its label, in the type of every legend. */
function ShapeLegend({ symbols }: { symbols: readonly ShapeSymbol[] }) {
  return (
    <div className="legend">
      <ul className="legend-classes">
        {symbols.map((symbol, index) => (
          <li key={index}>
            <ShapeSample symbol={symbol} />
            {symbol.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Return the id of the row of a member of a group, for bringing the row into view. */
function memberRowId(layer: string, member: string): string {
  return `contents-member-${layer}-${member}`;
}

/** Return the members of a shape layer as its description states them now, or undefined for a layer without any. */
function membersOf(layer: string): ShapeMembers | undefined {
  return shapeLayersStore.get().find(({ id }) => id === layer)?.members;
}

interface MemberRowProps {
  /** The id of the group. */
  layer: string;
  id: string;
  title: string;
  line: string | undefined;
  selected: boolean;
  visible: boolean;
}

/**
 * One shape of a group: the box that shows or hides it, its name, which selects it and with a second click ends
 * the selection, and the button that moves the map to it. The row is drawn again only when what it shows has
 * changed, because a group may hold two thousand shapes; its commands therefore take what they call from the
 * description of the group at the moment of the click.
 */
const MemberRow = memo(function MemberRow({ layer, id, title, line, selected, visible }: MemberRowProps) {
  return (
    <li id={memberRowId(layer, id)} className={selected ? "item item--selected" : "item"}>
      <label className="contents-member-visible">
        <input
          type="checkbox"
          checked={visible}
          aria-label={`Show ${title}`}
          onChange={(event) => membersOf(layer)?.setVisible(id, event.target.checked)}
        />
      </label>
      <button
        type="button"
        className="item-main contents-member-name"
        aria-pressed={selected}
        onClick={() => membersOf(layer)?.select(selected ? null : id)}
      >
        <span className="item-title">{title}</span>
        {line === undefined ? null : <span className="item-line">{line}</span>}
      </button>
      <div className="item-actions">
        <IconButton icon="zoom_in" label={`Zoom to ${title}`} onClick={() => membersOf(layer)?.zoomTo(id)} />
      </div>
    </li>
  );
});

/**
 * The shapes of a group, one row each. The selected one is marked as the selected item of a list, and it is
 * brought into the visible part of the pane when it becomes selected, for example by a click on the map.
 */
function MemberList({ layer, members }: { layer: string; members: ShapeMembers }) {
  const { selected } = members;
  const before = useRef(selected);
  const hidden = new Set(members.hidden);

  // The member that was already selected when the list opened stays where it is.
  useEffect(() => {
    if (selected !== null && selected !== before.current) {
      document.getElementById(memberRowId(layer, selected))?.scrollIntoView({ block: "nearest" });
    }
    before.current = selected;
  }, [layer, selected]);

  return (
    <ul className="item-list contents-members">
      {members.items.map(({ id, title, line }) => (
        <MemberRow
          key={id}
          layer={layer}
          id={id}
          title={title}
          line={line}
          selected={id === selected}
          visible={!hidden.has(id)}
        />
      ))}
    </ul>
  );
}

interface ShapeLayerItemProps extends LayerRowProps {
  layer: ShapeLayer;
}

/**
 * One shape layer of the Contents pane: the area, the area of the search or the outlines of the products found,
 * which another part of the interface draws. Its row has the columns of the row of every layer: the arrow that
 * folds its legend, the box that shows or hides it, its name, which selects it, and the button of its menu. Under
 * the row stand its legend, with a sample of each symbol, and its opacity. A group lists its shapes under these,
 * in a section that is closed at first and draws its rows only while it is open. The right mouse button opens the
 * menu of the row at the pointer.
 */
export function ShapeLayerItem({ layer, place, count, drop, onMoved, onRemoved, ...drag }: ShapeLayerItemProps) {
  const map = useMap();
  const display = useStore(shapeDisplayStore)[layer.id] ?? FIRST_SHAPE_DISPLAY;
  const selected = useStore(selectedLayerStore) === layer.id;
  const folded = useStore(foldedStore).includes(layer.id);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const detailsId = useId();
  const opacityId = useId();
  const percent = Math.round(display.opacity * 100);
  const { members } = layer;

  const move = (direction: Move) => {
    moveLayer(layer.id, direction);
    onMoved(layer.id);
  };

  // The part that owns the layer may keep it; the focus leaves the row only when the row has gone.
  const remove = () => {
    if (removeShapeLayer(layer)) {
      onRemoved(place);
    }
  };

  const items: MenuItem[] = [
    { id: "zoom", label: "Zoom to layer", run: () => void fitLayer(map, layer.id) },
    { id: "up", label: "Move up", disabled: place === 0, separated: true, run: () => move("up") },
    { id: "down", label: "Move down", disabled: place === count - 1, run: () => move("down") },
    { id: "top", label: "Move to top", disabled: place === 0, run: () => move("top") },
    { id: "bottom", label: "Move to bottom", disabled: place === count - 1, run: () => move("bottom") },
    { id: "remove", label: "Remove", separated: true, run: remove },
    {
      id: "properties",
      label: "Properties",
      separated: true,
      run: () => propertiesStore.set({ id: layer.id, time: Date.now() }),
    },
  ];

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  // With the focus on the name, Alt and an arrow key move the layer and Delete removes it.
  const onNameKey = (event: KeyboardEvent) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(event.key === "ArrowUp" ? "up" : "down");
    } else if (event.key === "Delete") {
      event.preventDefault();
      remove();
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
        draggable
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
            onChange={(event) => setShapeDisplay(layer.id, { visible: event.target.checked })}
          />
        </label>
        <button
          type="button"
          id={nameButtonId(layer.id)}
          className="contents-name"
          aria-pressed={selected}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete"
          onClick={() => selectedLayerStore.set(selected ? null : layer.id)}
          onKeyDown={onNameKey}
        >
          <span className="item-title">{layer.title}</span>
          {layer.line === undefined ? null : (
            <>
              {" "}
              <span className="item-line">{layer.line}</span>
            </>
          )}
        </button>
        <MenuButton
          icon="more_vert"
          label="More"
          name={`More commands of ${layer.title}`}
          items={items.map(({ label, run, disabled, separated }) => ({ label, onSelect: run, disabled, separated }))}
        />
      </div>
      <div className="contents-details" id={detailsId} hidden={folded}>
        <ShapeLegend symbols={layer.symbols} />
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
            onChange={(event) => setShapeDisplay(layer.id, { opacity: Number(event.target.value) / 100 })}
          />
          <span aria-hidden="true">{percent} %</span>
        </div>
        {members === undefined ? null : (
          <Section title="Shapes" count={members.items.length} open={open} onToggle={setOpen}>
            {open && !folded ? <MemberList layer={layer.id} members={members} /> : null}
          </Section>
        )}
      </div>
      {menu && (
        <Menu label={`More commands of ${layer.title}`} items={items} at={menu} focus="first" onClose={closeMenu} />
      )}
    </li>
  );
}
