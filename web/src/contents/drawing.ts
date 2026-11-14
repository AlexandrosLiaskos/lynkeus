import type OlMap from "ol/Map";
import WebGLTileLayer from "ol/layer/WebGLTile";
import type { LayerDescription } from "../shared/layer";
import { report } from "../shared/messages/messages";
import { createStore } from "../shared/store";
import { CogError, type Cog } from "./cog";
import { CogSource } from "./CogSource";
import { fileOf, forgetFile } from "./files";
import { inDecibels, shownRange } from "./scaling";
import { firstDisplay, type LayerDisplay } from "./state";
import { NO_MASK, layerStyle, type StyleChoices } from "./style";

/** The drawing order of the first layer of the Contents pane. The background maps are drawn below it. */
export const FIRST_Z_INDEX = 100;

/**
 * The largest number of tiles of one layer that the map keeps for drawing. A tile of 512 by 512 cells takes two
 * megabytes, or three when the layer is shown in decibels.
 */
const TILES_KEPT = 48;

/** For each layer whose file could not be read, by its id: why, in one sentence. */
export const layerProblemsStore = createStore<Readonly<Record<string, string>>>({});

interface Drawn {
  layer: WebGLTileLayer;
  url: string;
  cog: Promise<Cog>;
  decibels: boolean;
  /** The choices of the style that the layer has, as one text. */
  style: string;
}

/** Return the choices of a display that give a layer its style. */
function choicesOf(display: LayerDisplay): StyleChoices {
  return { colours: display.colours, inverted: display.inverted ?? false, noDataColour: display.noDataColour ?? null };
}

/** Return the sentence that tells the visitor why a file could not be read. */
function problemOf(error: Error | null): string {
  return error instanceof CogError ? error.message : "The file of the layer could not be read.";
}

/**
 * The layers of the Contents pane on the map. For every layer description the map receives one layer, which
 * carries the id of the description, reads the Cloud Optimized GeoTIFF of the description and draws it as the
 * display of the layer says.
 */
export class LayerDrawing {
  private readonly map: OlMap;
  private readonly open: (url: string) => Promise<Cog>;
  private readonly workers: boolean;
  private readonly drawn = new Map<string, Drawn>();

  /**
   * @param map The map of the page.
   * @param open Opens the file at an address. The tests give their own.
   * @param workers False decompresses the tiles in the page itself.
   */
  constructor(map: OlMap, open: (url: string) => Promise<Cog> = fileOf, workers = true) {
    this.map = map;
    this.open = open;
    this.workers = workers;
  }

  /**
   * Bring the map in line with the layers of the Contents pane, given in drawing order with the bottom layer
   * first, and with their displays.
   */
  update(layers: readonly LayerDescription[], displays: Readonly<Record<string, LayerDisplay>>): void {
    for (const [id, { url }] of this.drawn) {
      if (!layers.some((layer) => layer.id === id && layer.url === url)) {
        this.remove(id);
      }
    }
    layers.forEach((description, place) => {
      const display = displays[description.id] ?? firstDisplay(description);
      const decibels = inDecibels(description, display);
      const choices = choicesOf(display);
      const style = JSON.stringify(choices);
      const drawn = this.drawn.get(description.id) ?? this.add(description, decibels, choices);
      const { layer } = drawn;
      if (drawn.decibels !== decibels) {
        layer.getSource()?.dispose();
        layer.setSource(this.source(description, drawn.cog, decibels));
      }
      if (drawn.decibels !== decibels || drawn.style !== style) {
        layer.setStyle(layerStyle(choices, decibels ? 3 : 2));
      }
      drawn.decibels = decibels;
      drawn.style = style;
      const [lowest, highest] = shownRange(description, display);
      const [maskLowest, maskHighest] = display.mask ?? NO_MASK;
      layer.updateStyleVariables({ lowest, highest, maskLowest, maskHighest });
      layer.setVisible(display.visible);
      layer.setOpacity(display.opacity);
      layer.setZIndex(FIRST_Z_INDEX + place);
    });
  }

  /** Take every layer of the Contents pane off the map. */
  clear(): void {
    for (const id of [...this.drawn.keys()]) {
      this.remove(id);
    }
  }

  private add(description: LayerDescription, decibels: boolean, choices: StyleChoices): Drawn {
    const { id, url } = description;
    const cog = this.open(url);
    const layer = new WebGLTileLayer({
      source: this.source(description, cog, decibels),
      style: layerStyle(choices, decibels ? 3 : 2),
      cacheSize: TILES_KEPT,
      properties: { id },
    });
    const drawn = { layer, url, cog, decibels, style: JSON.stringify(choices) };
    this.drawn.set(id, drawn);
    this.map.addLayer(layer);
    return drawn;
  }

  private source({ id, title }: LayerDescription, cog: Promise<Cog>, decibels: boolean): CogSource {
    const source = new CogSource({ cog, decibels, workers: this.workers });
    source.on("change", () => {
      if (source.getState() === "error" && this.drawn.get(id)?.layer.getSource() === source) {
        const problem = problemOf(source.getError());
        layerProblemsStore.set({ ...layerProblemsStore.get(), [id]: problem });
        report("error", `${title}: ${problem}`);
      }
    });
    return source;
  }

  private remove(id: string): void {
    const drawn = this.drawn.get(id);
    if (drawn) {
      this.map.removeLayer(drawn.layer);
      drawn.layer.getSource()?.dispose();
      drawn.layer.dispose();
      forgetFile(drawn.url);
      this.drawn.delete(id);
    }
    const problems = layerProblemsStore.get();
    if (id in problems) {
      layerProblemsStore.set(Object.fromEntries(Object.entries(problems).filter(([key]) => key !== id)));
    }
  }
}
