import { PropertiesWindow } from "./Properties";
import { SymbologyPane } from "./Symbology";

/**
 * The panes and the windows that the menu of a layer opens. They are declared on the right side of the map,
 * where a tool pane is drawn.
 */
export function ContentsTools() {
  return (
    <>
      <SymbologyPane />
      <PropertiesWindow />
    </>
  );
}
