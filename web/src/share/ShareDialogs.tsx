// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect } from "react";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { LayoutSheet } from "./LayoutSheet";
import { faultMessage, openLink, withoutLink } from "./link";
import { SharePanes } from "./SharePanes";

/**
 * Bring the map to the state that the address of the page gives, when the page opens and whenever the fragment
 * of the address changes. The parts of the link then leave the address, so that the address never names a state
 * other than the one shown.
 */
function useLinkOfAddress(): void {
  const map = useMap();
  useEffect(() => {
    const read = () => {
      const fragment = window.location.hash;
      const rest = withoutLink(fragment);
      if (rest === fragment) {
        return;
      }
      const faults = openLink(map, fragment);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${rest}`,
      );
      if (faults.length > 0) {
        report("warning", faultMessage(faults));
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [map]);
}

/**
 * The elements of the Share tab that the page holds once: the tool panes of its forms, and the page of a
 * layout, which shows only in a print. The component also reads a link to a map from the address of the page.
 */
export function ShareDialogs() {
  useLinkOfAddress();
  return (
    <>
      <SharePanes />
      <LayoutSheet />
    </>
  );
}
