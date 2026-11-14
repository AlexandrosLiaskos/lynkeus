import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { displayOf, displayStore, firstDisplay, resetDisplay, selectedLayerStore, setDisplay } from "./state";

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
