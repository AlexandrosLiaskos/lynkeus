// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import {
  copyDisplay,
  displayOf,
  displayStore,
  firstDisplay,
  pasteDisplay,
  resetDisplay,
  selectedLayerStore,
  setDisplay,
} from "./state";
import { inundation } from "./testClasses";

const LAYER: LayerDescription = {
  id: "gcov-hhhh-20261021",
  title: "Backscatter HH",
  kind: "layer",
  url: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  unit: "1",
  range: [0.01, 0.4],
  colours: "grey",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L2_PR_GCOV_010_141_D_067_4005_DHDH_A_20261021T101010_20261021T101045_X05009_N_F_J_001"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json",
};

beforeEach(() => {
  displayStore.set({});
  selectedLayerStore.set(null);
});

test("a layer starts shown and opaque, with the range and the colour scale of its description", () => {
  expect(displayOf(LAYER)).toEqual({ visible: true, opacity: 1, range: [0.01, 0.4], colours: "grey" });
  expect(displayOf(LAYER)).toEqual(firstDisplay(LAYER));
  expect(displayStore.get()).toEqual({});
});

test("a change of the display keeps the other parts of it", () => {
  setDisplay(LAYER, { opacity: 0.5 });
  setDisplay(LAYER, { colours: "viridis" });
  expect(displayOf(LAYER)).toEqual({ visible: true, opacity: 0.5, range: [0.01, 0.4], colours: "viridis" });
});

test("a change of one layer leaves the display of another layer as it is", () => {
  const other = { ...LAYER, id: "gcov-hhhh-20261102" };
  setDisplay(LAYER, { visible: false });
  expect(displayOf(other).visible).toBe(true);
});

test("a layer returns to its first display", () => {
  setDisplay(LAYER, { visible: false, range: [0, 1] });
  resetDisplay(LAYER.id);
  expect(displayOf(LAYER)).toEqual(firstDisplay(LAYER));
  expect(displayStore.get()).toEqual({});
});

test("no layer is selected at the start", () => {
  expect(selectedLayerStore.get()).toBeNull();
});

test("between a layer of classes and another layer, Paste display passes only the colour of the cells without data", () => {
  const classes = inundation();
  setDisplay(LAYER, { colours: "viridis", range: [0, 1], noDataColour: "#ff0000", opacity: 0.5 });
  copyDisplay(LAYER);
  pasteDisplay(classes);
  expect(displayOf(classes)).toEqual({
    visible: true,
    opacity: 1,
    range: [1, 3],
    colours: "classes",
    noDataColour: "#ff0000",
  });
  setDisplay(classes, { noDataColour: "#00ff00" });
  copyDisplay(classes);
  pasteDisplay(LAYER);
  expect(displayOf(LAYER)).toEqual({
    visible: true,
    opacity: 0.5,
    range: [0, 1],
    colours: "viridis",
    noDataColour: "#00ff00",
  });
});
