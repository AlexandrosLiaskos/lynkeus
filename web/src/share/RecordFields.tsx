import { useId } from "react";
import type { LayerDescription } from "../shared/layer";
import { SELECT_A_LAYER } from "./selection";

/** The two forms in which the record of a layer is saved. */
export type RecordForm = "stac" | "provenance";

interface RecordFieldsProps {
  /** The layer that is selected in the Contents pane, or null. */
  layer: LayerDescription | null;
  form: RecordForm;
  onChange: (form: RecordForm) => void;
}

const FORMS = [
  [
    "stac",
    "STAC record",
    "A JSON file in the form of a STAC Item: the grid, the statistics, the processing and the links of the layer.",
  ],
  [
    "provenance",
    "Provenance record",
    "A text file: the input files, the program and its version, and the reference of the method.",
  ],
] as const;

/** The fields of the record: the layer whose record is saved, and the form of the record. */
export function RecordFields({ layer, form, onChange }: RecordFieldsProps) {
  const id = useId();
  if (!layer) {
    return <p className="usa-hint share-note">{SELECT_A_LAYER}</p>;
  }
  return (
    <fieldset className="usa-fieldset">
      <legend className="usa-legend">Record of {layer.title}</legend>
      {FORMS.map(([value, label, hint]) => (
        <div className="usa-radio" key={value}>
          <input
            className="usa-radio__input"
            id={`${id}-${value}`}
            type="radio"
            name={`${id}-form`}
            value={value}
            checked={form === value}
            aria-describedby={`${id}-${value}-hint`}
            onChange={() => onChange(value)}
          />
          <label className="usa-radio__label" htmlFor={`${id}-${value}`}>
            {label}
          </label>
          <p className="usa-hint share-note share-note--choice" id={`${id}-${value}-hint`}>
            {hint}
          </p>
        </div>
      ))}
    </fieldset>
  );
}
