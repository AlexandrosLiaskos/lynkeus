// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { createStore } from "../shared/store";

/** The tools of the Map tab that work on the map itself. At most one of them is in use at a time. */
export type MapTool = "area-rectangle" | "measure-distance" | "measure-area" | "identify";

/** The tool in use, or null. The button of the tool in use is shown as pressed. */
export const toolStore = createStore<MapTool | null>(null);

/** Start a tool, or end it when it is already in use. */
export function toggleTool(tool: MapTool): void {
  toolStore.set(toolStore.get() === tool ? null : tool);
}

/** Whether the lines of latitude and longitude are shown over the map. */
export const graticuleStore = createStore(false);
