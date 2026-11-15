import { useEffect, useState } from "react";
import type { LayerDescription } from "../shared/layer";
import { dataSources, type DataSource } from "./citation";
import { readRecord } from "./record";
import { layerMissing } from "./selection";

/** The datasets of the layers that were asked for, by the address of the record of the layer. */
const read = new Map<string, Promise<DataSource[]>>();

/**
 * Return the datasets that a layer was made from, as its record and the records of its inputs name them. The
 * value is null while the records are read and when no layer is given, and an empty list when the records name
 * no dataset or cannot be read.
 */
export function useDataSources(layer: LayerDescription | null): readonly DataSource[] | null {
  const [found, setFound] = useState<{ record: string; sources: readonly DataSource[] } | null>(null);
  const record = layer?.record ?? null;

  useEffect(() => {
    if (record === null) {
      return;
    }
    let wanted = true;
    const sources = read.get(record) ?? dataSources(record, readRecord);
    read.set(record, sources);
    sources.then(
      (list) => {
        if (wanted) {
          setFound({ record, sources: list });
        }
      },
      () => {
        // A record that could not be read is asked for again the next time.
        read.delete(record);
        if (wanted) {
          setFound({ record, sources: [] });
        }
      },
    );
    return () => {
      wanted = false;
    };
  }, [record]);

  return record !== null && found?.record === record ? found.sources : null;
}

/** Forget the datasets that were read. The tests start from this state. */
export function forgetDataSources(): void {
  read.clear();
}

/**
 * Return the sentence that states what the citation of the selected layer lacks, or undefined when the layer can
 * be cited. It lacks, in this order: a selected layer, the end of the reading of its record, and a record that
 * names the DOI of a NISAR collection. `sources` is the value of `useDataSources` for the layer.
 */
export function citationMissing(
  layer: LayerDescription | null,
  hasLayers: boolean,
  sources: readonly DataSource[] | null,
): string | undefined {
  if (!layer) {
    return layerMissing(hasLayers);
  }
  if (sources === null) {
    return "The record of the layer is being read.";
  }
  return sources.length > 0 ? undefined : "The record of the layer names no DOI of a NISAR collection.";
}
