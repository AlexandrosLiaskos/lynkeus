import { createStore } from "../shared/store";
import type { CoordinateFormat } from "./coordinates";

/** Whether the status bar is shown. The View tab changes it. */
export const statusBarStore = createStore(true);

/** The way in which the status bar writes coordinates. */
export const coordinateFormatStore = createStore<CoordinateFormat>("degrees");
