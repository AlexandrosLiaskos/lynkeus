import type { LayerDescription } from "../shared/layer";
import { useStore } from "../shared/store";
import { colourScale, isColourScale, scaleKind } from "./colours";
import { formatNumber, formatUnit, legendTicks, rampImage } from "./legendValues";
import { displayStore, firstDisplay } from "./state";

/** The largest number of classes that a legend lists. The scale of classes has ten colours. */
const MOST_CLASSES = 10;

/** Return the colour of a class: the classes take the colours of the scale in turn. */
function classColour(colours: readonly string[], value: number): string {
  const count = colours.length;
  return colours[((value % count) + count) % count] ?? "";
}

/** The legend of a scale of classes: each whole number of the range beside its colour. */
function ClassLegend({ colours, range }: { colours: readonly string[]; range: readonly [number, number] }) {
  const first = Math.ceil(range[0]);
  const count = Math.max(0, Math.floor(range[1]) - first + 1);
  const values = Array.from({ length: Math.min(count, MOST_CLASSES) }, (_, index) => first + index);
  return (
    <>
      <ul className="legend-classes">
        {values.map((value) => (
          <li key={value}>
            <span className="legend-swatch" style={{ background: classColour(colours, value) }} aria-hidden="true" />
            {value}
          </li>
        ))}
      </ul>
      {count > MOST_CLASSES && <p className="legend-note">The colours repeat every ten values.</p>}
    </>
  );
}

/** The legend of a continuous scale: the colours from the lowest value, at the bottom, to the highest value. */
function RampLegend({ layer, unit }: { layer: LayerDescription; unit: string }) {
  const { range, colours: name } = useStore(displayStore)[layer.id] ?? firstDisplay(layer);
  const [lowest, highest] = range;
  const marks = [
    { value: lowest, label: formatNumber(lowest) },
    ...legendTicks(lowest, highest),
    { value: highest, label: formatNumber(highest) },
  ];
  const ends = `from ${formatNumber(lowest)} to ${formatNumber(highest)}${unit && ` ${unit}`}`;
  return (
    <div className="legend-scale">
      <div
        className="legend-ramp"
        role="img"
        aria-label={`Colour scale ${isColourScale(name) ? name : "grey"}, ${ends}`}
        style={{ background: rampImage(colourScale(name), scaleKind(name)) }}
      />
      <ol className="legend-marks" aria-hidden="true">
        {marks.map(({ value, label }) => (
          <li key={value} style={{ bottom: `${String(((value - lowest) / (highest - lowest)) * 100)}%` }}>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The legend of a layer: its quantity, its unit and its colour scale, with the lowest and the highest value of
 * the scale and round values between them. The legend follows the display of the layer.
 */
export function Legend({ layer }: { layer: LayerDescription }) {
  const { range, colours: name } = useStore(displayStore)[layer.id] ?? firstDisplay(layer);
  const unit = formatUnit(layer.unit);
  return (
    <div className="legend">
      <p className="legend-quantity">
        {layer.quantity}
        {unit && ` (${unit})`}
      </p>
      {scaleKind(name) === "classes" ? (
        <ClassLegend colours={colourScale(name)} range={range} />
      ) : (
        <RampLegend layer={layer} unit={unit} />
      )}
      {!isColourScale(name) && (
        <p className="legend-note">Lynkeus has no colour scale named {name}. The layer is drawn in greys.</p>
      )}
    </div>
  );
}
