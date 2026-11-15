import { formatUnit } from "../contents/legendValues";
import { selectedLayerStore } from "../contents/state";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { COORDINATE_FORMATS, writeCoordinate, type CoordinateFormat } from "./coordinates";
import { formatValue, useLayerValue, WIDEST_VALUE } from "./layerValue";
import { useMapState, type MapState, type Pointer } from "./mapState";
import { projectionName } from "./projection";
import { rotationInDegrees, showNorthUp } from "./rotation";
import { formatScale, scaleAt, showScale } from "./scale";
import { ScaleControl } from "./ScaleControl";
import { coordinateFormatStore, statusBarStore } from "./state";
import { Credits } from "../shared/credits/Credits";

/**
 * The names of the items of the bar. Each item carries its name in the attribute `title`, which the browser
 * shows while the pointer rests on the item. The browser places that text inside the window, also above an
 * element that stands at the lower edge of the page.
 */
export const ITEM_NAMES = {
  pointer: "Coordinates under the pointer",
  centre: "Coordinates of the centre of the map",
  format: "Coordinate format",
  loading: "The map is loading data",
  rotation: "Rotation of the map, clockwise",
  projection: "Projection of the map",
} as const;

/**
 * A value of the status bar in a field of one width. The widest texts that the value can take stand unseen in
 * the same place, so the field does not change its width when the value changes.
 */
function Field({ text, widest }: { text: string; widest: readonly string[] }) {
  return (
    <span className="statusbar-field">
      {widest.map((sample) => (
        <span key={sample} className="statusbar-field-widest" aria-hidden="true">
          {sample}
        </span>
      ))}
      <span className="statusbar-field-text">{text}</span>
    </span>
  );
}

/**
 * The coordinates under the pointer, or of the centre of the map while the pointer is not over the map, and the
 * list that chooses how they are written. The list is a part of its own, which a narrow window places beside the
 * scale.
 */
function Coordinates({ state }: { state: MapState }) {
  const format = useStore(coordinateFormatStore);
  const { projection, resolution, centre, pointer } = state;
  const { parts, widest } = writeCoordinate(pointer?.coordinate ?? centre, projection, resolution, format, centre);

  return (
    <>
      <span className="statusbar-item" title={pointer ? ITEM_NAMES.pointer : ITEM_NAMES.centre}>
        <span className="statusbar-label">
          <Field text={pointer ? "Pointer" : "Centre"} widest={["Pointer", "Centre"]} />
        </span>
        {parts.map((part, index) => (
          <Field key={index} text={part} widest={widest[index] ?? []} />
        ))}
      </span>
      <span className="statusbar-item statusbar-format">
        <select
          className="statusbar-select"
          aria-label={ITEM_NAMES.format}
          title={ITEM_NAMES.format}
          value={format}
          onChange={(event) => coordinateFormatStore.set(event.target.value as CoordinateFormat)}
        >
          {COORDINATE_FORMATS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </span>
    </>
  );
}

/** The text shown where the selected layer has no value. */
export const NO_DATA = "No data";

/**
 * The value of the layer that is selected in the Contents pane, under the pointer or, while the pointer is not
 * over the map, at the centre of the map, with the name of the layer and the unit of its values. A long name is
 * shortened in the bar, and the name of the item gives it in full.
 */
function LayerValue({ pointer }: { pointer: Pointer | null }) {
  const map = useMap();
  const selected = useStore(selectedLayerStore);
  const layer = useStore(mapLayersStore).find(({ id }) => id === selected);
  const value = useLayerValue(map, layer?.id ?? null, pointer?.pixel ?? null);
  if (!layer) {
    return null;
  }
  // The unit is written as the legend of the Contents pane writes it; a quantity without dimension has none.
  const unit = formatUnit(layer.unit);
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);
  return (
    <span
      className="statusbar-item statusbar-value"
      title={`Value of ${layer.title} ${pointer ? "under the pointer" : "at the centre of the map"}`}
    >
      <span className="statusbar-label statusbar-layer-name">{layer.title}</span>
      <Field
        text={value === null ? NO_DATA : withUnit(formatValue(value))}
        widest={[withUnit(WIDEST_VALUE), NO_DATA]}
      />
    </span>
  );
}

/**
 * The projection of the map: its name and, in brackets, its code. A window that is not wide shows the code
 * alone: the style file hides the name and the brackets there, and the name of the item gives them.
 */
function Projection({ name }: { name: string }) {
  const title = `${ITEM_NAMES.projection}: ${name}`;
  const bracket = name.indexOf(" (");
  if (bracket < 0) {
    return (
      <span className="statusbar-item" title={title}>
        {name}
      </span>
    );
  }
  return (
    <span className="statusbar-item statusbar-projection" title={title}>
      <span className="statusbar-projection-name">{name.slice(0, bracket + 2)}</span>
      {name.slice(bracket + 2, -1)}
      <span className="statusbar-projection-name">)</span>
    </span>
  );
}

/** The row of the status bar. */
function Bar() {
  const map = useMap();
  const state = useMapState(map);
  if (!state) {
    return null;
  }
  const { projection, resolution, centre, rotation, loading } = state;
  const turned = rotationInDegrees(rotation);

  const chooseScale = (scale: number) => {
    if (!showScale(map, scale)) {
      report("warning", `The map cannot show the scale ${formatScale(scale)}. It shows the nearest scale that it can.`);
    }
  };

  return (
    <section className="statusbar" aria-label="Status bar">
      <ScaleControl scale={scaleAt(projection, resolution, centre)} onChoose={chooseScale} />
      <Coordinates state={state} />
      <LayerValue pointer={state.pointer} />
      <span className="statusbar-item statusbar-loading" title={loading ? ITEM_NAMES.loading : undefined}>
        <Field text={loading ? "Loading" : ""} widest={["Loading"]} />
      </span>
      {turned !== 0 && (
        <span className="statusbar-item" title={ITEM_NAMES.rotation}>
          <span className="statusbar-label">Rotation</span>
          <Field text={`${turned.toFixed(1)}°`} widest={["-188.8°"]} />
          <button type="button" className="statusbar-button" onClick={() => showNorthUp(map)}>
            North up
          </button>
        </span>
      )}
      <Projection name={projectionName(projection)} />
      <Credits place="beside" />
    </section>
  );
}

/**
 * The status bar, under the map: the scale, the coordinates under the pointer, the value of the selected layer
 * there, the state of loading, the rotation and the projection of the map, and the credits of its layers. Every
 * item has one form: its name in the colour of secondary text, its value in the colour of content, and a short
 * line between it and the item before it. The View tab shows and hides the bar.
 */
export function StatusBar() {
  return useStore(statusBarStore) ? <Bar /> : null;
}
