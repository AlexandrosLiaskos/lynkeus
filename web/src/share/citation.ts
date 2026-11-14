import { version } from "../../package.json";
import type { LayerDescription } from "../shared/layer";
import { siteAddress, type LayerRecord } from "./record";

/**
 * The titles of the NISAR collections that Lynkeus reads, by their DOI. They were read from NASA's Common
 * Metadata Repository (fields `DOI.DOI` and `EntryTitle` of `collections.umm_json`, provider ASF) on
 * 14 November 2026, and are written as read.
 */
export const COLLECTION_TITLES: Readonly<Partial<Record<string, string>>> = {
  "10.5067/NIL2GCOV-V1": "NISAR Validated Geocoded Polarimetric Covariance Product (Version 1)",
  "10.5067/NIL2GCOV-P1": "NISAR Provisional Geocoded Polarimetric Covariance Product (Version 1)",
  "10.5067/NIL2GUNW-V1": "NISAR Validated Geocoded Unwrapped Interferogram Product (Version 1)",
  "10.5067/NIL1GUNW-P1": "NISAR Provisional Geocoded Unwrapped Interferogram Product (Version 1)",
  "10.5067/NIL2GOFF-V1": "NISAR Validated Geocoded Pixel Offsets (Version 1)",
  "10.5067/NIL2GOFF-P1": "NISAR Provisional Geocoded Pixel Offsets (Version 1)",
  "10.5067/NIL3SME2-P1": "NISAR Provisional Soil Moisture (Version 1)",
};

/** The author and the publisher of a NISAR collection, as the catalogue page of NASA Earthdata cites them. */
const AUTHOR = "NASA/JPL/NISAR";
const PUBLISHER = "NASA Alaska Satellite Facility Distributed Active Archive Center";

/** How Lynkeus is cited. The values are those of the file CITATION.cff of the repository; a test compares them. */
export const LYNKEUS = {
  author: "Liaskos, A.",
  title: "Lynkeus",
  version,
  address: "https://github.com/AlexandrosLiaskos/lynkeus",
} as const;

/** The form of a DOI in the Scientific Citation extension of STAC. */
const DOI = /^10\.[0-9a-zA-Z]{4,}\/[^\s]+$/;

/** A dataset that a layer was made from, as its record names it. */
export interface DataSource {
  /** DOI of the dataset, without the address of the resolver. */
  doi: string;
  /** The recommended citation of the dataset, when the record gives one. */
  citation: string | null;
  /** The day on which Lynkeus received the data, as year-month-day, when the record states it. */
  accessed: string | null;
}

/** Return the dataset that a record names in the fields `sci:doi` and `sci:citation`, or null when it names none. */
export function sourceOf({ properties }: LayerRecord): DataSource | null {
  const doi = properties["sci:doi"];
  if (typeof doi !== "string" || !DOI.test(doi)) {
    return null;
  }
  const citation = properties["sci:citation"];
  const processed = properties["processing:datetime"];
  return {
    doi,
    citation: typeof citation === "string" && citation.trim() !== "" ? citation.trim() : null,
    accessed: typeof processed === "string" && /^\d{4}-\d{2}-\d{2}/.test(processed) ? processed.slice(0, 10) : null,
  };
}

/** The largest number of records that are read for the sources of one layer. */
const MOST_RECORDS = 32;

/**
 * Return the datasets that a layer was made from, each once, in the order found. The record of a received layer
 * names its dataset. The record of a result links to the records of its inputs with the relation
 * `derived_from`, and these are read in turn. Only records of this site are read.
 */
export async function dataSources(
  address: string,
  read: (address: string) => Promise<LayerRecord>,
): Promise<DataSource[]> {
  const sources = new Map<string, DataSource>();
  const seen = new Set<string>();
  const waiting = [address];
  while (waiting.length > 0 && seen.size < MOST_RECORDS) {
    const next = siteAddress(waiting.shift() ?? "");
    if (next === null || seen.has(next)) {
      continue;
    }
    seen.add(next);
    const record = await read(next);
    const source = sourceOf(record);
    if (source) {
      if (!sources.has(source.doi)) {
        sources.set(source.doi, source);
      }
    } else {
      waiting.push(
        ...record.links.filter(({ rel }) => rel === "derived_from").map(({ href }) => new URL(href, next).href),
      );
    }
  }
  return [...sources.values()];
}

/**
 * Return the citation of a dataset. The citation that the record gives is used word for word. Without one, the
 * citation has the form of the catalogue page of NASA Earthdata: author, title, "[Dataset]", publisher and the
 * address of the DOI. The year of that form is left out, because the catalogue of NASA does not state it.
 */
export function dataCitation({ doi, citation, accessed }: DataSource): string {
  const address = `https://doi.org/${doi}`;
  const title = COLLECTION_TITLES[doi];
  const cited = citation ?? (title === undefined ? address : `${AUTHOR}. ${title} [Dataset]. ${PUBLISHER}. ${address}`);
  return accessed === null ? cited : `${cited} Date accessed: ${accessed}.`;
}

/** Return the citation of Lynkeus, in the form of a citation of software. */
export function softwareCitation(): string {
  return `${LYNKEUS.author} ${LYNKEUS.title} (Version ${LYNKEUS.version}) [Computer software]. ${LYNKEUS.address}`;
}

/**
 * Return the text that cites a layer: its data, with the product files used, the method of a result, and
 * Lynkeus.
 */
export function citationText(layer: LayerDescription, sources: readonly DataSource[]): string {
  const parts = [
    ["Data", ...sources.map(dataCitation), `Product files: ${layer.inputs.join(", ")}.`],
    ...(layer.method === null ? [] : [["Method", layer.method]]),
    ["Software", softwareCitation()],
  ];
  return parts.map((part) => part.join("\n")).join("\n\n");
}
