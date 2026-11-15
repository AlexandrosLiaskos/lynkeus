import { useEffect } from "react";
import { ServersPane } from "../servers/ServersPane";
import { followSession } from "./follow";
import { Footprints } from "./Footprints";
import { GetLayerPane } from "./GetLayerPane";
import { SearchAreaLayer } from "./SearchAreaLayer";
import { SearchPane } from "./SearchPane";
import { onSignInEnded } from "./service";
import { signInEnded } from "./session";
import { SignInPane } from "./SignInPane";

/**
 * The panes of the Data tab, among them the pane of the servers of the visitor, and what the search draws on the
 * map: the area of the search and the outlines of the products found. The page holds them once.
 */
export function DataDialogs() {
  // The jobs and the layers of the session are read when the page loads. From then on a job that ends is
  // announced, and an answer 401 of the server to a request about a job ends the sign-in on the page.
  useEffect(() => {
    onSignInEnded(signInEnded);
    return followSession();
  }, []);

  return (
    <>
      <SignInPane />
      <SearchPane />
      <GetLayerPane />
      <ServersPane />
      <SearchAreaLayer />
      <Footprints />
    </>
  );
}
