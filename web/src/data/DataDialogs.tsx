// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect } from "react";
import { ServersPane } from "../servers/ServersPane";
import { followSession } from "./follow";
import { Footprints } from "./Footprints";
import { GetLayerPane } from "./GetLayerPane";
import { SearchAreaLayer } from "./SearchAreaLayer";
import { SearchPane } from "./SearchPane";
import { onSignInNeeded } from "./service";
import { signInNeeded } from "./session";
import { SignInPane } from "./SignInPane";
import { SignOutDialog } from "./SignOutDialog";

/**
 * The panes of the Data tab, among them the pane of the servers of the visitor, and what the search draws on the
 * map: the area of the search and the outlines of the products found. The page holds them once.
 */
export function DataDialogs() {
  // The jobs and the layers of the account are read when the page loads and when the sign-in changes. From then on
  // a job that ends is announced, and a request that the server refuses with the answer 401 waits for the sign-in.
  useEffect(() => {
    onSignInNeeded(signInNeeded);
    const stop = followSession();
    return () => {
      stop();
      onSignInNeeded(null);
    };
  }, []);

  return (
    <>
      <SignInPane />
      <SignOutDialog />
      <SearchPane />
      <GetLayerPane />
      <ServersPane />
      <SearchAreaLayer />
      <Footprints />
    </>
  );
}
