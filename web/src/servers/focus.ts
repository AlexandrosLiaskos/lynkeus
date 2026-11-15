// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { paneElementId } from "../shared/dock/dock";
import { SERVERS_PANE } from "./state";

/**
 * Give the keyboard focus to the title of the pane of the servers when the element that held the focus has left
 * the page, as the button of a step does when the next step takes its place. The focus stays where it is when
 * an element of the page holds it.
 */
export function focusHeading(): void {
  if (document.activeElement === null || document.activeElement === document.body) {
    document.getElementById(paneElementId(SERVERS_PANE))?.querySelector<HTMLElement>(".pane-title")?.focus();
  }
}
