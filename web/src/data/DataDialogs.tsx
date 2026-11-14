import { Footprints } from "./Footprints";
import { SearchDialog } from "./SearchDialog";
import { SignInPane } from "./SignInPane";

/** The dialogs of the Data tab, and the outlines that its search draws on the map. The page holds them once. */
export function DataDialogs() {
  return (
    <>
      <SignInPane />
      <SearchDialog />
      <Footprints />
    </>
  );
}
