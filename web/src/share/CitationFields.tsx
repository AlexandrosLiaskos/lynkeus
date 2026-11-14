import { useId, type RefObject } from "react";
import type { LayerDescription } from "../shared/layer";
import { SELECT_A_LAYER } from "./selection";

interface CitationFieldsProps {
  /** The layer that is selected in the Contents pane, or null. */
  layer: LayerDescription | null;
  /** The text that cites the layer, or null while its record is read or when the record names no dataset. */
  citation: string | null;
  /** The field of the citation, so that its text can be selected for copying. */
  field: RefObject<HTMLTextAreaElement | null>;
}

/** The fields of the citation: the text that cites the selected layer, and what the text holds. */
export function CitationFields({ layer, citation, field }: CitationFieldsProps) {
  const id = useId();
  if (!layer) {
    return <p className="usa-hint share-note">{SELECT_A_LAYER}</p>;
  }
  if (citation === null) {
    return (
      <p className="usa-hint share-note">
        The record of {layer.title} does not name the DOI of its NISAR collection, so Lynkeus gives no citation for it.
      </p>
    );
  }
  return (
    <>
      <label className="usa-label" htmlFor={`${id}-citation`}>
        Citation of {layer.title}
      </label>
      <textarea
        ref={field}
        className="usa-textarea share-citation"
        id={`${id}-citation`}
        value={citation}
        readOnly
        rows={14}
        spellCheck={false}
        aria-describedby={`${id}-holds`}
      />
      <p className="usa-hint share-note" id={`${id}-holds`}>
        The data are cited as the catalogue of NASA Earthdata cites a NISAR collection, with the DOI that the record of
        the layer names and the day on which Lynkeus received the data. The method is the reference of the analysis
        tool, and Lynkeus is cited as its file CITATION.cff states.
      </p>
    </>
  );
}
