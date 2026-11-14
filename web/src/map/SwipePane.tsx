import { useId } from "react";
import { selectedLayerStore } from "../contents/state";
import { closeToolPane } from "../shared/dock/dock";
import { mapLayersStore } from "../shared/mapLayers";
import { useStore } from "../shared/store";
import { ToolPane } from "../shared/toolpane/ToolPane";
import { swipeStore, type SwipeLine } from "./swipe";

const LINES: readonly { line: SwipeLine; label: string }[] = [
  { line: "upright", label: "Upright, moved left and right" },
  { line: "level", label: "Level, moved up and down" },
];

/** The pane of the Swipe button: the layer that is swiped and the direction of the line. */
export function SwipePane() {
  const id = useId();
  const swipe = useStore(swipeStore);
  const selected = useStore(selectedLayerStore);
  const title = useStore(mapLayersStore).find((layer) => layer.id === selected)?.title;

  const end = () => {
    swipeStore.set({ ...swipeStore.get(), on: false });
    closeToolPane("swipe");
  };

  return (
    <ToolPane
      id="swipe"
      title="Swipe"
      runLabel="End swipe"
      onRun={end}
      onClose={() => swipeStore.set({ ...swipeStore.get(), on: false })}
    >
      <p className="map-pane-line">
        {title
          ? `The line uncovers what lies below the layer ${title}, which is the layer selected in the Contents pane.`
          : "No layer is selected. Select the layer to swipe in the Contents pane."}
      </p>
      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Line</legend>
        {LINES.map(({ line, label }) => (
          <div key={line} className="usa-radio">
            <input
              className="usa-radio__input"
              id={`${id}-${line}`}
              type="radio"
              name={`${id}-line`}
              checked={swipe.line === line}
              onChange={() => swipeStore.set({ ...swipe, line })}
            />
            <label className="usa-radio__label" htmlFor={`${id}-${line}`}>
              {label}
            </label>
          </div>
        ))}
      </fieldset>
      <p className="usa-hint">
        The layer is drawn on the left of an upright line and under a level line. Drag the line across the map. With the
        keyboard focus on the line, the arrow keys move it by one percent of the map, the Page Up and Page Down keys by
        ten percent, and the Home and End keys to the edges.
      </p>
    </ToolPane>
  );
}
