import { GET_LAYER_PANE } from "../data/state";
import { openToolPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import type { LayerDescription } from "../shared/layer";
import { setPaneOpen } from "../shared/panes";
import { PropertyList } from "../shared/properties/PropertyList";
import { useHasLayers } from "./selection";

interface LayerNeededProps {
  /** What the tool does with the layer, as the end of the sentence "Select a layer in the Contents pane to". */
  purpose: string;
}

/**
 * What a tool of the selected layer shows while no layer is selected: what is missing, how the user gets it, and
 * the button of the next step. While the map has no layer, the button opens the tool Get layer. Once the map has
 * one, the button shows the Contents pane, in which a layer is selected.
 */
export function LayerNeeded({ purpose }: LayerNeededProps) {
  const hasLayers = useHasLayers();
  return hasLayers ? (
    <EmptyState
      title="No layer selected"
      text={`Select a layer in the Contents pane to ${purpose}.`}
      action={{ label: "Show Contents pane", onClick: () => setPaneOpen("contents", true) }}
    />
  ) : (
    <EmptyState
      title="No layers on the map"
      text={`Get a layer, then select it in the Contents pane to ${purpose}.`}
      action={{ label: "Get layer", onClick: () => openToolPane(GET_LAYER_PANE) }}
    />
  );
}

interface SelectedLayerProps {
  /** The layer that is selected in the Contents pane. */
  layer: LayerDescription;
}

/** The line that names the layer on which a tool acts. */
export function SelectedLayer({ layer }: SelectedLayerProps) {
  return (
    <div className="share-facts">
      <PropertyList
        groups={[
          { rows: [{ name: "Layer", value: layer.title, info: "The layer that is selected in the Contents pane." }] },
        ]}
      />
    </div>
  );
}
