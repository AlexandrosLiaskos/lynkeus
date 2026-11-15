import { isArea, type Area } from "./area";

/** The NISAR product types that Lynkeus reads. */
export const PRODUCT_TYPES = ["GCOV", "GUNW", "GOFF", "SME2"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * The description of a layer. The Contents pane receives one for every layer, whether the layer was received
 * from NASA or computed by an analysis tool.
 */
export interface LayerDescription {
  /** Unique name of the layer. */
  id: string;
  /** Name shown in the panes. */
  title: string;
  /** "layer" for data received, "result" for the output of a tool. */
  kind: "layer" | "result";
  /** Address of the Cloud Optimized GeoTIFF. */
  url: string;
  /** What the values are. */
  quantity: string;
  /** Unit of the values. */
  unit: string;
  /** Lowest and highest value of the legend, in the unit of the layer. */
  range: readonly [number, number];
  /** Name of the colour scale. */
  colours: string;
  /** Date or dates of the data, each as year-month-day. */
  dates: readonly string[];
  /** Names of the product files used. */
  inputs: readonly string[];
  /**
   * Name of the layer inside the product, as the layer request gave it, for example "HHHH". A layer received from
   * NASA has one. A result has null, and a layer stored before this field existed has null or no field.
   */
  layer?: string | null;
  /**
   * Words that name the lowest and the highest end of the legend, for example ["decrease", "increase"]. Only a
   * result may have them, when its tool gives them. A layer has null or no field, and so has a description stored
   * before this field existed.
   */
  ends?: readonly [string, string] | null;
  /**
   * Centre frequency of the radar band of the layer, in hertz, as the product states it. The layer
   * `unwrappedPhase` of a GUNW product has one when the server received it from NASA and the product states the
   * frequency. Every other layer has null or no field, a result has none, and so has a description stored before
   * this field existed.
   */
  frequency?: number | null;
  /** Program and version that produced the file. */
  program: string;
  /** Reference of the method. A result has one, and a layer has null. */
  method: string | null;
  /** Address of the STAC record. */
  record: string;
}

/** What a dialog sends to the server to receive a layer. The answer is a job, whose result is a layer description. */
export interface LayerRequest {
  product: ProductType;
  /** Name of the product file, from the search. */
  granule: string;
  /** Name of the layer inside the product. */
  layer: string;
  area: Area;
}

/** What the tool dialog sends to the server to start an analysis. The answer is a job, as for a layer request. */
export interface ToolRun {
  /** Name of the button of the tool. */
  tool: string;
  /** The id of each input layer, in the order that the method sheet gives. */
  inputs: readonly string[];
  /** Name of the result. */
  title: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isList(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isItem);
}

/** Tell whether a value that the server sent is a layer description. */
export function isLayerDescription(value: unknown): value is LayerDescription {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const layer = value as Record<string, unknown>;
  const { kind, range, method } = layer;
  const name = layer.layer ?? null;
  const ends = layer.ends ?? null;
  const frequency = layer.frequency ?? null;
  return (
    [layer.id, layer.title, layer.url, layer.quantity, layer.unit, layer.colours, layer.program, layer.record].every(
      isText,
    ) &&
    (kind === "layer" || kind === "result") &&
    Array.isArray(range) &&
    range.length === 2 &&
    typeof range[0] === "number" &&
    typeof range[1] === "number" &&
    range[0] < range[1] &&
    isList(layer.dates, (date) => typeof date === "string" && DATE.test(date)) &&
    isList(layer.inputs, isText) &&
    (kind === "result" ? name === null : name === null || isText(name)) &&
    (ends === null || (kind === "result" && Array.isArray(ends) && ends.length === 2 && ends.every(isText))) &&
    (frequency === null ||
      (kind === "layer" && typeof frequency === "number" && Number.isFinite(frequency) && frequency > 0)) &&
    (kind === "result" ? isText(method) : method === null)
  );
}

/** Tell whether a value is a layer request. */
export function isLayerRequest(value: unknown): value is LayerRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { product, granule, layer, area } = value as Record<string, unknown>;
  return PRODUCT_TYPES.some((type) => type === product) && isText(granule) && isText(layer) && isArea(area);
}
