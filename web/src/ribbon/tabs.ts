// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { ANALYSIS_TAB } from "../analysis/tab";
import { DATA_TAB } from "../data/tab";
import { HELP_TAB } from "../help/tab";
import { MAP_TAB } from "../map/tab";
import { OPTIONS_TAB } from "../options/tab";
import { SHARE_TAB } from "../share/tab";
import { VIEW_TAB } from "../view/tab";
import type { RibbonTab } from "./types";

/** The tabs of the ribbon, in the order shown. Each one is declared in the folder of its owner. */
export const TABS: readonly RibbonTab[] = [MAP_TAB, DATA_TAB, ANALYSIS_TAB, VIEW_TAB, SHARE_TAB, OPTIONS_TAB, HELP_TAB];
