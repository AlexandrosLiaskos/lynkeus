import { Footprints } from "./Footprints";
import { SearchAreaLayer } from "./SearchAreaLayer";
import { SearchPane } from "./SearchPane";
import { SignInPane } from "./SignInPane";

/**
 * The panes of the Data tab, and what its search draws on the map: the area of the search and the outlines of
 * the products found. The page holds them once.
 */
export function DataDialogs() {
  return (
    <>
      <SignInPane />
      <SearchPane />
      <SearchAreaLayer />
      <Footprints />
    </>
  );
}
