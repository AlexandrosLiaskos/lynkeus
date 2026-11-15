// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useRef, useState, type ChangeEvent } from "react";
import { useMap } from "../shared/map";
import { Notice } from "../shared/notice/Notice";
import { useStore } from "../shared/store";
import { AREA_FILE_TYPES, readAreaFile } from "./areaFile";
import { EXPLANATIONS } from "./explanations";
import { FieldTitle, infoId } from "./FieldTitle";
import type { SearchDraft } from "./search";
import { describeArea, fitRings, rectangleAround, viewArea, type Rectangle, type SearchArea } from "./searchArea";
import { drawingStore, productsStore, selectedProductStore } from "./state";

const SIDES = [
  ["west", "West"],
  ["east", "East"],
  ["south", "South"],
  ["north", "North"],
] as const;

/** Write the sides of a rectangle as the text of the four fields. */
export function rectangleText({ west, south, east, north }: Rectangle): SearchDraft["area"] {
  return { kind: "rectangle", west: String(west), south: String(south), east: String(east), north: String(north) };
}

function draftArea(area: SearchArea): SearchDraft["area"] {
  return area.kind === "rectangle" ? rectangleText(area) : area;
}

interface AreaFieldsProps {
  draft: SearchDraft;
  onChange: (change: Partial<SearchDraft>) => void;
  /** The explanation of the area, when the area serves another tool than the search. */
  explanation?: string;
  /** What is wrong with the area for the tool that it serves, in one or two sentences, or null. */
  fault?: string | null;
}

/**
 * The area of the search. As the extent of a tool in ArcGIS Pro and in QGIS, one list takes the area from the
 * view of the map, from a shape drawn on the map, from the outline of the selected product or from a file, and
 * four fields take typed coordinates. After the area is taken, the list names what the area is. The explanation
 * of each title shows from the button beside it. An error of the area, from a file that could not be read or
 * from the tool that the area serves, stands under the fields and describes the list.
 */
export function AreaFields({ draft, onChange, explanation = EXPLANATIONS.area, fault = null }: AreaFieldsProps) {
  const map = useMap();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<{ kind: "note" | "fault"; text: string } | null>(null);
  const drawing = useStore(drawingStore);
  const results = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const product = results?.products.find((found) => found.id === selected);
  const { area, limited } = draft;
  const polygons = limited && area.kind === "polygons" ? area : null;
  const shown = drawing ? `draw-${drawing}` : !limited ? "earth" : polygons ? "polygons" : "rectangle";

  const take = (next: SearchArea | null) => {
    onChange(next ? { limited: true, area: draftArea(next) } : { limited: false });
  };

  const onChoose = (event: ChangeEvent<HTMLSelectElement>) => {
    const choice = event.target.value;
    setNote(null);
    drawingStore.set(choice === "draw-rectangle" ? "rectangle" : choice === "draw-polygon" ? "polygon" : null);
    if (choice === "rectangle") {
      // The fields keep their sides, or take the rectangle around the polygons that were the area.
      if (area.kind === "polygons") {
        take({ kind: "rectangle", ...rectangleAround(area.rings) });
      } else {
        onChange({ limited: true });
      }
    } else if (choice === "earth") {
      take(null);
    } else if (choice === "view") {
      take({ kind: "rectangle", ...viewArea(map) });
    } else if (choice === "product") {
      const rings = product ? fitRings(product.footprint) : null;
      if (rings && rings.length > 0) {
        take({ kind: "polygons", rings });
      }
    } else if (choice === "file") {
      fileInput.current?.click();
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file can be chosen again after a change of the file.
    event.target.value = "";
    if (!file) {
      return;
    }
    readAreaFile(file)
      .then((read) => {
        onChange({ limited: true, area: draftArea(read.area) });
        setNote(read.note ? { kind: "note", text: read.note } : null);
      })
      .catch((error: unknown) => {
        setNote({ kind: "fault", text: error instanceof Error ? error.message : "The file could not be read." });
      });
  };

  const polygonName = polygons ? describeArea(polygons) : "";
  const faults = [note?.kind === "fault" ? note.text : null, fault].filter((text) => text !== null);
  const faultIds = faults.map((_, index) => `${id}-fault-${String(index)}`);

  return (
    <>
      <FieldTitle field={`${id}-area`} title="Area">
        {explanation}
      </FieldTitle>
      <select
        className="usa-select"
        id={`${id}-area`}
        aria-describedby={[infoId(`${id}-area`), ...faultIds].join(" ")}
        value={shown}
        onChange={onChoose}
      >
        <option value="rectangle">Rectangle with the sides below</option>
        {polygons ? (
          <option value="polygons">{polygonName.charAt(0).toUpperCase() + polygonName.slice(1)}</option>
        ) : null}
        <option value="earth">Whole Earth</option>
        <optgroup label="Take the area from">
          <option value="view">The view of the map</option>
          <option value="draw-rectangle">A rectangle drawn on the map</option>
          <option value="draw-polygon">A polygon drawn on the map</option>
          <option value="product" disabled={!product}>
            The outline of the selected product
          </option>
          <option value="file">A file: GeoJSON, KML, KMZ or zipped shapefile</option>
        </optgroup>
      </select>
      <input
        ref={fileInput}
        type="file"
        className="search-file"
        accept={AREA_FILE_TYPES}
        aria-label="File with the area: GeoJSON, KML, KMZ or zipped shapefile"
        tabIndex={-1}
        onChange={onFile}
      />

      {drawing ? (
        <Notice kind="info">
          {drawing === "rectangle"
            ? "Press on the map, move the pointer and release. The Escape key ends the drawing."
            : "Click on the map for each point, and twice for the last. The Escape key ends the drawing."}
        </Notice>
      ) : null}

      {limited && area.kind === "rectangle" ? (
        <div className="search-row">
          {SIDES.map(([side, name]) => (
            <div key={side}>
              <FieldTitle field={`${id}-${side}`} title={name}>
                {EXPLANATIONS[side]}
              </FieldTitle>
              <input
                className="usa-input"
                id={`${id}-${side}`}
                aria-describedby={infoId(`${id}-${side}`)}
                inputMode="decimal"
                autoComplete="off"
                value={area[side]}
                onChange={(event) => onChange({ area: { ...area, [side]: event.target.value } })}
              />
            </div>
          ))}
        </div>
      ) : null}

      {faults.map((text, index) => (
        <p key={faultIds[index]} className="usa-error-message" id={faultIds[index]} role="alert">
          {text}
        </p>
      ))}
      {note?.kind === "note" ? <Notice kind="info">{note.text}</Notice> : null}
    </>
  );
}
