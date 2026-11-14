import { SOURCES as ANALYSIS_SOURCES } from "../analysis/sources";
import { SOURCES as DATA_SOURCES } from "../data/sources";
import { SOURCES as MAP_SOURCES } from "../map/sources";
import type { Source } from "../shared/sources";
import { SOURCES as STATUS_BAR_SOURCES } from "../statusbar/sources";

/** The list of one part of Lynkeus, under the name of the part. */
export interface SourcePart {
  name: string;
  sources: readonly Source[];
}

/**
 * The lists of the three parts, joined. The parts have the names and the order of CONTRIBUTING.md. The Map part
 * keeps two lists: the one of `map/` and the one of the status bar and the View tab, in `statusbar/`.
 */
export const SOURCE_PARTS: readonly SourcePart[] = [
  { name: "Map", sources: [...MAP_SOURCES, ...STATUS_BAR_SOURCES] },
  { name: "Data", sources: DATA_SOURCES },
  { name: "Analysis", sources: ANALYSIS_SOURCES },
];

/** Whether a text is an address of the web. */
function isWebAddress(text: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(text).protocol);
  } catch {
    return false;
  }
}

/**
 * Return what is wrong with the lists, in plain words: an entry without a name, a licence, a use or an address of
 * the web, an entry whose version is empty, and a name that appears twice. Two names that differ only in capital
 * letters count as one. The answer is empty when nothing is wrong.
 */
export function sourceFaults(parts: readonly SourcePart[]): string[] {
  const faults: string[] = [];
  const seen = new Map<string, string>();
  for (const part of parts) {
    part.sources.forEach((source, index) => {
      const name = source.name.trim();
      const entry = `${part.name}, entry ${String(index + 1)}${name === "" ? "" : ` (${name})`}`;
      if (name === "") {
        faults.push(`${entry} has no name.`);
      }
      if (source.version?.trim() === "") {
        faults.push(`${entry} has an empty version.`);
      }
      if (source.licence.trim() === "") {
        faults.push(`${entry} has no licence.`);
      }
      if (source.use.trim() === "") {
        faults.push(`${entry} has no use.`);
      }
      if (!isWebAddress(source.url)) {
        faults.push(`${entry} has no address of the web.`);
      }
      const first = seen.get(name.toLowerCase());
      if (name !== "" && first !== undefined) {
        faults.push(`${entry} has the name of ${first}.`);
      } else if (name !== "") {
        seen.set(name.toLowerCase(), `${part.name}, entry ${String(index + 1)}`);
      }
    });
  }
  return faults;
}
