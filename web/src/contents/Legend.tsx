import type { LayerClass, LayerDescription } from "../shared/layer";
import { useStore } from "../shared/store";
import { colourScale, isColourScale, scaleKind } from "./colours";
import { formatNumber, formatUnit, legendTicks, rampImage, tableLegend } from "./legendValues";
import { decibels } from "./cog";
import { inDecibels, shownRange, shownUnit } from "./scaling";
import { displayStore, firstDisplay, type LayerDisplay } from "./state";

/** The largest number of classes that a legend lists. The scale of classes has ten colours. */
const MOST_CLASSES = 10;

/** Return the colour of a class: the classes take the colours of the scale in turn. */
function classColour(colours: readonly string[], value: number): string {
  const count = colours.length;
  return colours[((value % count) + count) % count] ?? "";
}

/** Return the sentence that tells which values a mask hides, in the unit in which the layer is shown. */
function maskText(layer: LayerDescription, display: LayerDisplay): string {
  const [lowest, highest] = display.mask ?? [Number.NaN, Number.NaN];
  const unit = shownUnit(layer, display);
  const write = (value: number) => {
    return `${formatNumber(inDecibels(layer, display) ? decibels(value) : value)}${unit && ` ${unit}`}`;
  };
  // A layer in decibels has no decibels for a lower limit of zero or below, which hides nothing.
  return inDecibels(layer, display) && lowest <= 0
    ? `Values above ${write(highest)} are hidden.`
    : `Values below ${write(lowest)} and above ${write(highest)} are hidden.`;
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

/** The legend of a layer of classes: the name of each class beside its colour, in the order of their values. */
function TableLegend({ classes }: { classes: readonly LayerClass[] }) {
  return (
    <ul className="legend-classes">
      {tableLegend(classes).map(({ colour, label }, index) => (
        <li key={index}>
          <span className="legend-swatch" style={{ background: colour }} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Return the words that name the lowest and the highest end of the scale, or null. The words are those of the
 * legend that the tool gave, so they show while the range of the display is the range of the description. They
 * belong to the values, not to the colours: an inverted scale keeps each word beside its value.
 */
function wordsOfEnds(layer: LayerDescription, display: LayerDisplay): readonly [string, string] | null {
  if (display.range[0] !== layer.range[0] || display.range[1] !== layer.range[1]) {
    return null;
  }
  return layer.ends ?? null;
}

/**
 * The legend of a continuous scale: the colours from the lowest value, at the bottom, to the highest value. When
 * the description names the two ends in words, each word stands in brackets beside the value of its end.
 */
function RampLegend({ layer }: { layer: LayerDescription }) {
  const display = useStore(displayStore)[layer.id] ?? firstDisplay(layer);
  const name = display.colours;
  const colours = display.inverted ? [...colourScale(name)].reverse() : colourScale(name);
  const unit = shownUnit(layer, display);
  const [lowest, highest] = shownRange(layer, display);
  const words = wordsOfEnds(layer, display);
  const [lowestWord, highestWord] = words ? [` (${words[0]})`, ` (${words[1]})`] : ["", ""];
  const marks = [
    { value: lowest, label: `${formatNumber(lowest)}${lowestWord}` },
    ...legendTicks(lowest, highest),
    { value: highest, label: `${formatNumber(highest)}${highestWord}` },
  ];
  const ends = `from ${formatNumber(lowest)}${lowestWord} to ${formatNumber(highest)}${unit && ` ${unit}`}${highestWord}`;
  return (
    <div className="legend-scale">
      <div
        className="legend-ramp"
        role="img"
        aria-label={`Colour scale ${isColourScale(name) ? name : "grey"}${display.inverted ? ", inverted" : ""}, ${ends}`}
        style={{ background: rampImage(colours, scaleKind(name)) }}
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
 * the scale and round values between them, and the words of its two ends when the description has them. The
 * legend follows the display of the layer. For a layer that is
 * shown in decibels the legend says so, and the values beside the scale are decibels. A layer of classes lists
 * its classes, each with its name and its colour, and has no scale. Every note of the legend, such as the one on
 * decibels, on hidden values or on the cells without data, has one style.
 */
export function Legend({ layer }: { layer: LayerDescription }) {
  const display = useStore(displayStore)[layer.id] ?? firstDisplay(layer);
  const { range, colours: name } = display;
  const unit = formatUnit(layer.unit);
  const table = layer.classes ?? null;
  return (
    <div className="legend">
      <p className="legend-quantity">
        {layer.quantity}
        {unit && ` (${unit})`}
      </p>
      {inDecibels(layer, display) && <p className="legend-note">Shown in decibels (dB).</p>}
      {table ? (
        <TableLegend classes={table} />
      ) : scaleKind(name) === "classes" ? (
        <ClassLegend colours={colourScale(name)} range={range} />
      ) : (
        <RampLegend layer={layer} />
      )}
      {display.noDataColour && (
        <p className="legend-note legend-nodata">
          <span className="legend-swatch" style={{ background: display.noDataColour }} aria-hidden="true" />
          No data
        </p>
      )}
      {display.mask && !table && <p className="legend-note">{maskText(layer, display)}</p>}
      {!isColourScale(name) && !table && (
        <p className="legend-note">Lynkeus has no colour scale named {name}. The layer is drawn in greys.</p>
      )}
    </div>
  );
}
