import { useId } from "react";
import { selectedLayerStore } from "../contents/state";
import { closeToolPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { Info } from "../shared/info/Info";
import { mapLayersStore } from "../shared/mapLayers";
import { setPaneOpen } from "../shared/panes";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ToolPane } from "../shared/toolpane/ToolPane";
import { swipeStore, type SwipeLine } from "./swipe";

const LINES: readonly { line: SwipeLine; label: string }[] = [
  { line: "upright", label: "Vertical, moved left and right" },
  { line: "level", label: "Horizontal, moved up and down" },
];

/**
 * The pane of the Swipe button: the layer that is swiped, which is the layer selected in the Contents pane, and
 * the direction of the line. Without a selected layer the pane says how to select one.
 */
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
      <Section
        title="Layer"
        info="The layer that is selected in the Contents pane. The line uncovers what lies below this layer in the drawing order."
      >
        {title === undefined ? (
          <EmptyState
            title="No layer selected"
            text="Select the layer to swipe in the Contents pane."
            action={{ label: "Show Contents pane", onClick: () => setPaneOpen("contents", true) }}
          />
        ) : (
          <PropertyList groups={[{ rows: [{ name: "Name", value: title }] }]} />
        )}
      </Section>
      <fieldset className="usa-fieldset" aria-labelledby={`${id}-line`} aria-describedby={`${id}-line-info`}>
        <legend className="usa-legend">
          <span id={`${id}-line`}>Line</span>
          <Info id={`${id}-line-info`} about="Line">
            The layer is drawn on the left of a vertical line and under a horizontal line. The line is dragged across
            the map. With the keyboard focus on the line, the arrow keys move it by one percent of the map, the Page Up
            and Page Down keys by ten percent, and the Home and End keys to the edges.
          </Info>
        </legend>
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
    </ToolPane>
  );
}
