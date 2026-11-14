import { useId } from "react";
import { TITLE_LENGTH, type LayoutForm } from "./layout";
import { resolutionLabel, RESOLUTIONS } from "./pictureForm";

interface LayoutFieldsProps {
  form: LayoutForm;
  /** Whether the map shows a layer with a legend. The choice of the legend is offered only then. */
  hasLegend: boolean;
  /** What the user must know before the page is printed, for example that a background map will be left out. */
  notes: readonly string[];
  onChange: (form: LayoutForm) => void;
}

const ELEMENTS = [
  ["scaleBar", "Scale bar"],
  ["northArrow", "North arrow"],
  ["frame", "Coordinate frame"],
] as const;

/**
 * The fields of the layout: the title, the paper, the resolution of the map and the elements of the page. The
 * fields fill the container that holds them.
 */
export function LayoutFields({ form, hasLegend, notes, onChange }: LayoutFieldsProps) {
  const id = useId();
  return (
    <>
      <label className="usa-label" htmlFor={`${id}-title`}>
        Title
      </label>
      <input
        className="usa-input"
        id={`${id}-title`}
        type="text"
        maxLength={TITLE_LENGTH}
        value={form.title}
        onChange={(event) => onChange({ ...form, title: event.target.value })}
      />

      <label className="usa-label" htmlFor={`${id}-paper`}>
        Paper size
      </label>
      <select
        className="usa-select"
        id={`${id}-paper`}
        value={form.paper}
        onChange={(event) => onChange({ ...form, paper: event.target.value === "A3" ? "A3" : "A4" })}
      >
        <option value="A4">A4, 210 by 297 millimetres</option>
        <option value="A3">A3, 297 by 420 millimetres</option>
      </select>

      <label className="usa-label" htmlFor={`${id}-orientation`}>
        Orientation
      </label>
      <select
        className="usa-select"
        id={`${id}-orientation`}
        value={form.orientation}
        onChange={(event) =>
          onChange({ ...form, orientation: event.target.value === "portrait" ? "portrait" : "landscape" })
        }
      >
        <option value="landscape">Landscape</option>
        <option value="portrait">Portrait</option>
      </select>

      <label className="usa-label" htmlFor={`${id}-resolution`}>
        Resolution of the map
      </label>
      <select
        className="usa-select"
        id={`${id}-resolution`}
        value={String(form.resolution)}
        onChange={(event) =>
          onChange({ ...form, resolution: event.target.value === "screen" ? "screen" : Number(event.target.value) })
        }
      >
        <option value="screen">The pixels that the screen shows</option>
        {RESOLUTIONS.slice(1).map((resolution) => (
          <option key={resolution} value={String(resolution)}>
            {resolutionLabel(resolution)}
          </option>
        ))}
      </select>

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Elements</legend>
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
        {ELEMENTS.map(([name, label]) => (
          <div className="usa-checkbox" key={name}>
            <input
              className="usa-checkbox__input"
              id={`${id}-${name}`}
              type="checkbox"
              checked={form[name]}
              onChange={(event) => onChange({ ...form, [name]: event.target.checked })}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-${name}`}>
              {label}
            </label>
          </div>
        ))}
      </fieldset>

      <p className="usa-hint share-note">
        The page also states the scale, the projection, the date and the sources of the map. The print window of the
        browser prints the page or saves it as a PDF file.
      </p>
      {notes.map((note) => (
        <p className="usa-hint share-note" key={note}>
          {note}
        </p>
      ))}
    </>
  );
}
