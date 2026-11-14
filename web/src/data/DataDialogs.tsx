import { Footprints } from "./Footprints";
import { SearchDialog } from "./SearchDialog";

/** The dialogs of the Data tab, and the outlines that its search draws on the map. The page holds them once. */
export function DataDialogs() {
  return (
    <>
      <SearchDialog />
      <Footprints />
    </>
  );
}
