import { useId } from "react";
import { paperSize, pictureFault, PICTURE_LIMITS } from "./mapImage";
import {
  pictureSides,
  resolutionLabel,
  RESOLUTIONS,
  withResolution,
  withSide,
  withSize,
  type PictureForm,
} from "./pictureForm";

interface MapImageFieldsProps {
  form: PictureForm;
  /** Width and height of the map on the screen, in pixels. */
  screen: readonly [number, number];
  /** Whether the map shows a layer with a legend. The choice of the legend is offered only then. */
  hasLegend: boolean;
  /** What the user must know before the picture is made, for example that a background map will be left out. */
  notes: readonly string[];
  onChange: (form: PictureForm) => void;
}

/**
 * The fields of the map image: its resolution, its size and the elements drawn on it. The fields fill the
 * container that holds them.
 */
export function MapImageFields({ form, screen, hasLegend, notes, onChange }: MapImageFieldsProps) {
  const id = useId();
  const [width, height] = pictureSides(form, screen);
  const fault = pictureFault({ width, height, resolution: form.resolution });
  const [paperWidth, paperHeight] = paperSize(width, height, form.resolution);
  const { smallestSide, largestSide } = PICTURE_LIMITS;

  return (
    <>
      <label className="usa-label" htmlFor={`${id}-resolution`}>
        Resolution
      </label>
      <select
        className="usa-select"
        id={`${id}-resolution`}
        value={String(form.resolution)}
        onChange={(event) => onChange(withResolution(form, Number(event.target.value)))}
      >
        {RESOLUTIONS.map((resolution) => (
          <option key={resolution} value={String(resolution)}>
            {resolutionLabel(resolution)}
          </option>
        ))}
      </select>

      <label className="usa-label" htmlFor={`${id}-size`}>
        Size
      </label>
      <select
        className="usa-select"
        id={`${id}-size`}
        value={form.size}
        onChange={(event) => onChange(withSize(form, event.target.value === "custom" ? "custom" : "screen", screen))}
      >
        <option value="screen">The map as the screen shows it</option>
        <option value="custom">Custom</option>
      </select>

      {form.size === "custom" ? (
        <>
          {(["width", "height"] as const).map((side) => (
            <div key={side}>
              <label className="usa-label" htmlFor={`${id}-${side}`}>
                {side === "width" ? "Width in pixels" : "Height in pixels"}
              </label>
              <input
                className="usa-input"
                id={`${id}-${side}`}
                type="number"
                inputMode="numeric"
                min={smallestSide}
                max={largestSide}
                step={1}
                value={form[side]}
                aria-describedby={`${id}-state`}
                onChange={(event) => onChange(withSide(form, side, event.target.value, screen))}
              />
            </div>
          ))}
          <div className="usa-checkbox">
            <input
              className="usa-checkbox__input"
              id={`${id}-proportions`}
              type="checkbox"
              checked={form.proportions}
              onChange={(event) => onChange({ ...form, proportions: event.target.checked })}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-proportions`}>
              Keep the proportions of the map
            </label>
          </div>
        </>
      ) : null}

      {fault === null ? (
        <p className="usa-hint share-note" id={`${id}-state`}>
          {`The picture has ${String(width)} by ${String(height)} pixels. On paper it measures ${String(Math.round(paperWidth))} by ${String(Math.round(paperHeight))} millimetres.`}
        </p>
      ) : (
        <p className="usa-error-message share-note" id={`${id}-state`} role="alert">
          {fault}
        </p>
      )}

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Elements</legend>
        <div className="usa-checkbox">
          <input
            className="usa-checkbox__input"
            id={`${id}-scale-bar`}
            type="checkbox"
            checked={form.scaleBar}
            onChange={(event) => onChange({ ...form, scaleBar: event.target.checked })}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-scale-bar`}>
            Scale bar
          </label>
        </div>
        <div className="usa-checkbox">
          <input
            className="usa-checkbox__input"
            id={`${id}-north-arrow`}
            type="checkbox"
            checked={form.northArrow}
            onChange={(event) => onChange({ ...form, northArrow: event.target.checked })}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-north-arrow`}>
            North arrow, when the map is rotated
          </label>
        </div>
        {hasLegend ? (
          <div className="usa-checkbox">
            <input
              className="usa-checkbox__input"
              id={`${id}-legend`}
              type="checkbox"
              checked={form.legend}
              onChange={(event) => onChange({ ...form, legend: event.target.checked })}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-legend`}>
              Legend of the visible layers
            </label>
          </div>
        ) : null}
      </fieldset>

      <p className="usa-hint share-note">
        The sources of the map are always written on the picture, as the services of the background maps ask.
      </p>
      {notes.map((note) => (
        <p className="usa-hint share-note" key={note}>
          {note}
        </p>
      ))}
    </>
  );
}
