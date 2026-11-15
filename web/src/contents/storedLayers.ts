import { isLayerDescription, type LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { keepInBrowser } from "../shared/storage/storage";
import { displayStore, type LayerDisplay, type Stretch } from "./state";

/** The name under which the layers of the map are kept in the local storage of the browser. */
export const LAYERS_KEY = "lynkeus.layers";

/** The layers of the map as the browser keeps them. */
export interface StoredLayers {
  /** The descriptions of the layers, in drawing order: the first one is drawn at the bottom. */
  layers: readonly LayerDescription[];
  /** The display of each layer that has one, by the id of the layer. */
  displays: Readonly<Record<string, LayerDisplay>>;
}

/** The largest number of layers of a stored map, and the largest number of characters of the name of a scale. */
const MOST_LAYERS = 500;
const NAME_LENGTH = 64;

const COLOUR = /^#[0-9a-f]{6}$/i;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Return a value as a range, a lowest and a higher highest number, or undefined when it is not one. */
function rangeOf(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }
  const [lowest, highest] = value as unknown[];
  return isNumber(lowest) && isNumber(highest) && lowest < highest ? [lowest, highest] : undefined;
}

/** Return a value as the rule of a range, or undefined when it is not one. */
function stretchOf(value: unknown): Stretch | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { kind, percent, count } = value as Record<string, unknown>;
  switch (kind) {
    case "extremes":
    case "typed":
      return { kind };
    case "percent":
      return isNumber(percent) && percent >= 0 && percent < 50 ? { kind, percent } : undefined;
    case "deviations":
      return isNumber(count) && count > 0 ? { kind, count } : undefined;
    default:
      return undefined;
  }
}

/**
 * Check the display of a layer that was read from the storage: the layer is visible or not, its opacity lies
 * from 0 to 1, its range and its mask are a lowest and a higher highest number, its colour scale has a name, the
 * colour of the cells without data is written as # and six hexadecimal digits, and the rule of the range is one
 * of the Symbology pane. The display returned holds these fields only; a field that is wrong refuses the whole.
 */
export function storedDisplay(stored: unknown): LayerDisplay | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { visible, opacity, colours, decibels, inverted, noDataColour } = stored as Record<string, unknown>;
  const fields = stored as Record<string, unknown>;
  const range = rangeOf(fields.range);
  const mask = fields.mask === undefined ? undefined : rangeOf(fields.mask);
  const stretch = fields.stretch === undefined ? undefined : stretchOf(fields.stretch);
  if (
    typeof visible !== "boolean" ||
    !isNumber(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    !range ||
    typeof colours !== "string" ||
    colours === "" ||
    colours.length > NAME_LENGTH ||
    (decibels !== undefined && typeof decibels !== "boolean") ||
    (inverted !== undefined && typeof inverted !== "boolean") ||
    (noDataColour !== undefined && (typeof noDataColour !== "string" || !COLOUR.test(noDataColour))) ||
    (fields.mask !== undefined && !mask) ||
    (fields.stretch !== undefined && !stretch)
  ) {
    return undefined;
  }
  return {
    visible,
    opacity,
    range,
    colours,
    ...(decibels === undefined ? {} : { decibels }),
    ...(inverted === undefined ? {} : { inverted }),
    ...(noDataColour === undefined ? {} : { noDataColour }),
    ...(mask ? { mask } : {}),
    ...(stretch ? { stretch } : {}),
  };
}

/** Tell whether a text is the address of a file of this site: a path that names no other server. */
function isSitePath(address: string): boolean {
  return address.startsWith("/") && !address.startsWith("//") && !address.includes("\\");
}

/**
 * Check the layers that were read from the storage. Each layer is a layer description whose file is a file of
 * this site, no two layers have one id, and each display is the valid display of one of the layers. A layer or
 * a display that is wrong refuses the whole, so that the map never shows half of what was stored.
 */
export function storedLayers(stored: unknown): StoredLayers | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { layers, displays } = stored as Record<string, unknown>;
  if (
    !Array.isArray(layers) ||
    layers.length > MOST_LAYERS ||
    !layers.every((layer): layer is LayerDescription => isLayerDescription(layer) && isSitePath(layer.url)) ||
    new Set(layers.map(({ id }) => id)).size !== layers.length ||
    typeof displays !== "object" ||
    displays === null ||
    Array.isArray(displays)
  ) {
    return undefined;
  }
  const checked: Record<string, LayerDisplay> = {};
  for (const [id, display] of Object.entries(displays)) {
    const valid = storedDisplay(display);
    if (!valid || !layers.some((layer) => layer.id === id)) {
      return undefined;
    }
    checked[id] = valid;
  }
  return { layers, displays: checked };
}

// The layers of the map are a part of the work that the browser keeps. They return when the page opens. A layer
// whose file the server no longer has is listed in the Contents pane with a notice that offers to remove it.
keepInBrowser<StoredLayers>({
  key: LAYERS_KEY,
  title: "Layers of the map",
  description: "The layers on the map, in their order, with the display of each.",
  read: () => {
    const layers = mapLayersStore.get();
    const displays = displayStore.get();
    return {
      layers,
      displays: Object.fromEntries(
        layers.flatMap(({ id }) => {
          const display = displays[id];
          return display ? [[id, display] as const] : [];
        }),
      ),
    };
  },
  check: storedLayers,
  restore: ({ layers, displays }) => {
    displayStore.set({ ...displayStore.get(), ...displays });
    mapLayersStore.set(layers);
  },
  subscribe: (listener) => {
    const ends = [mapLayersStore.subscribe(listener), displayStore.subscribe(listener)];
    return () => ends.forEach((end) => end());
  },
});
