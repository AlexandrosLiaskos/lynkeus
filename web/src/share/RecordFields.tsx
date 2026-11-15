import { useId } from "react";
import { Info } from "../shared/info/Info";
import type { LayerDescription } from "../shared/layer";
import { LayerNeeded, SelectedLayer } from "./SelectedLayer";

/** The two forms in which the record of a layer is saved. */
export type RecordForm = "stac" | "provenance";

interface RecordFieldsProps {
  /** The layer that is selected in the Contents pane, or null. */
  layer: LayerDescription | null;
  form: RecordForm;
  onChange: (form: RecordForm) => void;
}

const FORMS = [
  ["stac", "STAC record"],
  ["provenance", "Provenance record"],
] as const;

/**
 * The fields of the record: the layer whose record is saved, and the form of the record, with what each form
 * holds behind the "i" beside the title of the choice. Without a selected layer, the fields state what is needed
 * and offer the button that leads there.
 */
export function RecordFields({ layer, form, onChange }: RecordFieldsProps) {
  const id = useId();
  if (!layer) {
    return <LayerNeeded purpose="save its record" />;
  }
  return (
    <>
      <SelectedLayer layer={layer} />
      <fieldset className="usa-fieldset" aria-labelledby={`${id}-title`} aria-describedby={`${id}-info`}>
        <legend className="usa-legend">
          <span id={`${id}-title`}>Format</span>
          <Info id={`${id}-info`} about="Format">
            A STAC record is a JSON file in the form of a STAC Item: the grid, the statistics, the processing and the
            links of the layer. A provenance record is a text file: the input files, the program and its version, and
            the reference of the method.
          </Info>
        </legend>
        {FORMS.map(([value, label]) => (
          <div className="usa-radio" key={value}>
            <input
              className="usa-radio__input"
              id={`${id}-${value}`}
              type="radio"
              name={`${id}-form`}
              value={value}
              checked={form === value}
              onChange={() => onChange(value)}
            />
            <label className="usa-radio__label" htmlFor={`${id}-${value}`}>
              {label}
            </label>
          </div>
        ))}
      </fieldset>
    </>
  );
}
