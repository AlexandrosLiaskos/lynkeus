import { useId, type ChangeEvent } from "react";
import { drawingStore } from "../data/state";
import { DRAWING_HINTS } from "../shared/drawShape";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Notice } from "../shared/notice/Notice";
import { useStore } from "../shared/store";
import { analysisAreaStore, analysisDrawingStore, shapeWords } from "./analysisArea";

/** What the area serves: the statistics of the result of a tool that maps, or the cells of a series. */
export type AreaUse = "statistics" | "series";

/** The explanation of the field, by what the area serves. Each one is one sentence. */
export const ABOUT_AREA: Record<AreaUse, string> = {
  statistics:
    "The Properties of the result then give the statistics of its cells with data inside the rectangle or polygon that you draw on the map.",
  series:
    "The series takes the mean of the cells inside the rectangle or polygon that you draw on the map, or of the whole layer.",
};

/** The first choice of the field, which leaves the area out, by what the area serves. */
export const NO_AREA: Record<AreaUse, string> = { statistics: "None", series: "None, the whole layer" };

/**
 * The field Area of a form of the Analysis tab. One list takes no area, the area drawn on the map, or a new
 * rectangle or polygon drawn on the map, as the field Area of the search takes a drawn shape. Every form shows the
 * same area, which is the layer "Area of the analysis" of the Contents pane, so the choice None removes it from the
 * map. While a shape is drawn, a notice says how.
 */
export function AreaField({ use }: { use: AreaUse }) {
  const id = useId();
  const area = useStore(analysisAreaStore);
  const drawing = useStore(analysisDrawingStore);
  const shown = drawing ? `draw-${drawing}` : area ? "drawn" : "none";

  const onChoose = (event: ChangeEvent<HTMLSelectElement>) => {
    const choice = event.target.value;
    if (choice === "draw-rectangle" || choice === "draw-polygon") {
      // One drawing at a time: the drawing of the area of the search ends.
      drawingStore.set(null);
      analysisDrawingStore.set(choice === "draw-rectangle" ? "rectangle" : "polygon");
      return;
    }
    analysisDrawingStore.set(null);
    if (choice === "none") {
      analysisAreaStore.set(null);
    }
  };

  return (
    <>
      <FieldTitle field={`${id}-area`} title="Area">
        {ABOUT_AREA[use]}
      </FieldTitle>
      <select
        className="usa-select"
        id={`${id}-area`}
        value={shown}
        aria-describedby={infoId(`${id}-area`)}
        onChange={onChoose}
      >
        <option value="none">{NO_AREA[use]}</option>
        {area ? <option value="drawn">{shapeWords(area)}</option> : null}
        <optgroup label="Draw on the map">
          <option value="draw-rectangle">A rectangle</option>
          <option value="draw-polygon">A polygon</option>
        </optgroup>
      </select>
      {drawing ? <Notice kind="info">{DRAWING_HINTS[drawing]}</Notice> : null}
    </>
  );
}
