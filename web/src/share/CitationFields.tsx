// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, type RefObject } from "react";
import { EmptyState } from "../shared/empty/EmptyState";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import type { LayerDescription } from "../shared/layer";
import { LayerNeeded, SelectedLayer } from "./SelectedLayer";

interface CitationFieldsProps {
  /** The layer that is selected in the Contents pane, or null. */
  layer: LayerDescription | null;
  /** The text that cites the layer, or null while its record is read or when the record names no dataset. */
  citation: string | null;
  /** Whether the record of the layer is being read. */
  reading: boolean;
  /** The field of the citation, so that its text can be selected for copying. */
  field: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The fields of the citation: the layer that is cited, and the text that cites it, with what the text holds
 * behind the "i" beside its title. Without a selected layer, and for a layer whose record names no DOI, the
 * fields state what is needed.
 */
export function CitationFields({ layer, citation, reading, field }: CitationFieldsProps) {
  const id = useId();
  if (!layer) {
    return <LayerNeeded purpose="cite it" />;
  }
  if (citation === null) {
    return (
      <>
        <SelectedLayer layer={layer} />
        {reading ? null : (
          <EmptyState
            title="No citation for this layer"
            text="Select a layer whose record names the DOI of its NISAR collection."
          />
        )}
      </>
    );
  }
  return (
    <>
      <SelectedLayer layer={layer} />
      <FieldTitle field={`${id}-citation`} title="Citation">
        The data are cited as NASA&apos;s catalogue cites a NISAR collection, with the DOI that the record of the layer
        names and the day on which Lynkeus received the data. The method is cited by the reference of the analysis tool,
        and Lynkeus as its file CITATION.cff states.
      </FieldTitle>
      <textarea
        ref={field}
        className="usa-textarea share-citation"
        id={`${id}-citation`}
        value={citation}
        readOnly
        rows={14}
        spellCheck={false}
        aria-describedby={infoId(`${id}-citation`)}
      />
    </>
  );
}
