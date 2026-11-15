// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
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
