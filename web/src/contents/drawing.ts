// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type OlMap from "ol/Map";
import WebGLTileLayer from "ol/layer/WebGLTile";
import type { LayerDescription } from "../shared/layer";
import { report } from "../shared/messages/messages";
import { FIRST_Z_INDEX } from "../shared/shapeLayers";
import { createStore } from "../shared/store";
import { CogError, type Cog } from "./cog";
import { CogSource } from "./CogSource";
import { fileProblem, UNREADABLE, type LayerProblem } from "./fileProblem";
import { fileOf, forgetFile } from "./files";
import { inDecibels, shownRange } from "./scaling";
import { firstDisplay, type LayerDisplay } from "./state";
import { NO_MASK, layerStyle, type StyleChoices } from "./style";

/**
 * The largest number of tiles of one layer that the map keeps for drawing. A tile of 512 by 512 cells takes two
 * megabytes, or three when the layer is shown in decibels.
 */
const TILES_KEPT = 48;

/** For each layer whose file could not be read, by its id: why, in one sentence, and whether to try again. */
export const layerProblemsStore = createStore<Readonly<Record<string, LayerProblem>>>({});

/**
 * For each layer that the visitor asked to draw again, by its id: the number of times. The drawing opens the
 * file of such a layer anew, as it does after an own server that keeps the layer has connected again.
 */
export const drawAgainStore = createStore<Readonly<Record<string, number>>>({});

/** Ask the map to open the file of a layer again and to draw it anew. */
export function drawAgain(id: string): void {
  const turns = drawAgainStore.get();
  drawAgainStore.set({ ...turns, [id]: (turns[id] ?? 0) + 1 });
}

interface Drawn {
  layer: WebGLTileLayer;
  url: string;
  cog: Promise<Cog>;
  decibels: boolean;
  /** The choices of the style that the layer has, as one text. */
  style: string;
  /** The number of times that the visitor asked to draw the layer again when its file was opened. */
  turn: number;
  /** Whether the site is being asked why the file cannot be read. */
  asking: boolean;
}

/** Return the choices of a layer and of its display that give the layer its style. */
function choicesOf(description: LayerDescription, display: LayerDisplay): StyleChoices {
  return {
    colours: display.colours,
    inverted: display.inverted ?? false,
    noDataColour: display.noDataColour ?? null,
    classes: description.classes ?? null,
  };
}

/**
 * The layers of the Contents pane on the map. For every layer description the map receives one layer, which
 * carries the id of the description, reads the Cloud Optimized GeoTIFF of the description and draws it as the
 * display of the layer says. A layer of classes is drawn in the colours of its classes. The address of the file is the one of the description, whichever server keeps the
 * file: `/files/...` on the project server and `/api/servers/.../files/...` for an own server.
 *
 * A file that cannot be read, or whose tiles stop arriving, is not left as an empty layer: the site is asked
 * for the reason (see `fileProblem`), and the Contents pane states it in one sentence under the layer.
 */
export class LayerDrawing {
  private readonly map: OlMap;
  private readonly open: (url: string) => Promise<Cog>;
  private readonly workers: boolean;
  private readonly explain: (url: string) => Promise<LayerProblem | null>;
  private readonly drawn = new Map<string, Drawn>();

  /**
   * @param map The map of the page.
   * @param open Opens the file at an address. The tests give their own.
   * @param workers False decompresses the tiles in the page itself.
   * @param explain Asks why the file at an address cannot be read. The tests give their own.
   */
  constructor(
    map: OlMap,
    open: (url: string) => Promise<Cog> = fileOf,
    workers = true,
    explain: (url: string) => Promise<LayerProblem | null> = fileProblem,
  ) {
    this.map = map;
    this.open = open;
    this.workers = workers;
    this.explain = explain;
  }

  /**
   * Bring the map in line with the layers of the Contents pane, given in drawing order with the bottom layer
   * first, and with their displays.
   *
   * @param order The ids of all the layers of the map in drawing order, the bottom layer first: these layers and
   *   the shape layers that other parts draw. A layer is drawn at its place in this order, so that a shape layer
   *   can lie between two of these layers. Without it the layers given are the whole order.
   * @param again For each layer that the visitor asked to draw again, the number of times: the file of a layer
   *   whose number has changed is opened anew.
   */
  update(
    layers: readonly LayerDescription[],
    displays: Readonly<Record<string, LayerDisplay>>,
    order: readonly string[] = layers.map(({ id }) => id),
    again: Readonly<Record<string, number>> = {},
  ): void {
    for (const [id, { url, turn }] of this.drawn) {
      if (!layers.some((layer) => layer.id === id && layer.url === url) || turn !== (again[id] ?? 0)) {
        this.remove(id);
      }
    }
    layers.forEach((description, index) => {
      const display = displays[description.id] ?? firstDisplay(description);
      const decibels = inDecibels(description, display);
      const choices = choicesOf(description, display);
      const style = JSON.stringify(choices);
      const drawn =
        this.drawn.get(description.id) ?? this.add(description, decibels, choices, again[description.id] ?? 0);
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
      // A layer that the order does not name is drawn above the layers that it names.
      const place = order.indexOf(description.id);
      layer.setZIndex(FIRST_Z_INDEX + (place < 0 ? order.length + index : place));
    });
  }

  /** Take every layer of the Contents pane off the map. */
  clear(): void {
    for (const id of [...this.drawn.keys()]) {
      this.remove(id);
    }
  }

  private add(description: LayerDescription, decibels: boolean, choices: StyleChoices, turn: number): Drawn {
    const { id, url } = description;
    const cog = this.open(url);
    const layer = new WebGLTileLayer({
      source: this.source(description, cog, decibels),
      style: layerStyle(choices, decibels ? 3 : 2),
      cacheSize: TILES_KEPT,
      properties: { id },
    });
    const drawn = { layer, url, cog, decibels, style: JSON.stringify(choices), turn, asking: false };
    this.drawn.set(id, drawn);
    this.map.addLayer(layer);
    return drawn;
  }

  private source({ id, title }: LayerDescription, cog: Promise<Cog>, decibels: boolean): CogSource {
    const source = new CogSource({ cog, decibels, workers: this.workers });
    const isCurrent = () => this.drawn.get(id)?.layer.getSource() === source;
    const state = (problem: LayerProblem) => {
      layerProblemsStore.set({ ...layerProblemsStore.get(), [id]: problem });
      report("error", `${title}: ${problem.text}`);
    };
    // The file could not be opened. A file that Lynkeus cannot draw says why itself; for every other failure
    // the site is asked.
    source.on("change", () => {
      if (source.getState() !== "error" || !isCurrent()) {
        return;
      }
      const error = source.getError();
      if (error instanceof CogError) {
        state({ text: error.message, again: false });
      } else {
        this.ask(id, isCurrent, (problem) => state(problem ?? { text: UNREADABLE, again: true }));
      }
    });
    // A tile did not arrive. The site is asked once at a time, and a file that can still be read states nothing:
    // the map asks for the tile again when it is next needed.
    source.on("tileloaderror", () => {
      if (isCurrent() && !(id in layerProblemsStore.get())) {
        this.ask(id, isCurrent, (problem) => {
          if (problem) {
            state(problem);
          }
        });
      }
    });
    return source;
  }

  /** Ask the site why the file of a drawn layer cannot be read, unless it is being asked already. */
  private ask(id: string, isCurrent: () => boolean, tell: (problem: LayerProblem | null) => void): void {
    const drawn = this.drawn.get(id);
    if (!drawn || drawn.asking) {
      return;
    }
    drawn.asking = true;
    void this.explain(drawn.url).then((problem) => {
      drawn.asking = false;
      if (isCurrent()) {
        tell(problem);
      }
    });
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
