import type { Cog } from "./cog";
import { openCog } from "./CogSource";

const opened = new Map<string, Promise<Cog>>();

/**
 * Return the file at an address, opened once: the drawing of a layer, its Symbology pane and its Properties
 * window read the same file.
 */
export function fileOf(url: string): Promise<Cog> {
  let file = opened.get(url);
  if (!file) {
    file = openCog(url);
    opened.set(url, file);
  }
  return file;
}

/** Forget the file at an address, when its layer has left the map. */
export function forgetFile(url: string): void {
  opened.delete(url);
}
