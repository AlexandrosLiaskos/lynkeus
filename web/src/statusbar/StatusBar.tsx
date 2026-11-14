import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { COORDINATE_FORMATS, writeCoordinate, type CoordinateFormat } from "./coordinates";
import { useMapState, type MapState } from "./mapState";
import { projectionName } from "./projection";
import { rotationInDegrees, showNorthUp } from "./rotation";
import { formatScale, scaleAt, showScale } from "./scale";
import { ScaleControl } from "./ScaleControl";
import { coordinateFormatStore, statusBarStore } from "./state";

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
      <span className="statusbar-item">
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
          aria-label="Coordinate format"
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

/**
 * The projection of the map: its name and, in brackets, its code. A narrow window shows the code alone, and the
 * style file hides the name and the brackets there.
 */
function Projection({ name }: { name: string }) {
  const bracket = name.indexOf(" (");
  if (bracket < 0) {
    return <span className="statusbar-item">{name}</span>;
  }
  return (
    <span className="statusbar-item statusbar-projection">
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
      <span className="statusbar-item statusbar-item--end">
        <Field text={loading ? "Loading" : ""} widest={["Loading"]} />
      </span>
      {turned !== 0 && (
        <span className="statusbar-item">
          <span className="statusbar-label">Rotation</span>
          <Field text={`${turned.toFixed(1)}°`} widest={["-188.8°"]} />
          <button type="button" className="statusbar-button" onClick={() => showNorthUp(map)}>
            North up
          </button>
        </span>
      )}
      <Projection name={projectionName(projection)} />
    </section>
  );
}

/**
 * The status bar, under the map: the scale, the coordinates under the pointer, the state of loading, the
 * rotation and the projection of the map. The View tab shows and hides it.
 */
export function StatusBar() {
  return useStore(statusBarStore) ? <Bar /> : null;
}
