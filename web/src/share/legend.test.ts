// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test } from "vitest";
import { colourScale } from "../contents/colours";
import { displayStore, setDisplay } from "../contents/state";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { pictureLegend, visibleLayers } from "./legend";

const BACKSCATTER: LayerDescription = {
  id: "gcov-hhhh-20261021",
  title: "Backscatter HH, 21 Oct 2026",
  kind: "layer",
  url: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  unit: "1",
  range: [0, 0.5],
  colours: "grey",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json",
};
const MASK: LayerDescription = {
  ...BACKSCATTER,
  id: "mask",
  title: "Mask of valid samples",
  colours: "tab10",
  range: [0, 4],
};
const MOISTURE: LayerDescription = {
  ...BACKSCATTER,
  id: "moisture",
  title: "Soil moisture",
  unit: "m3 m-3",
  colours: "viridis",
};

beforeEach(() => {
  mapLayersStore.set([]);
  displayStore.set({});
});

test("the layers that are shown are listed with the highest one first, without the hidden ones", () => {
  mapLayersStore.set([BACKSCATTER, MASK, MOISTURE]);
  setDisplay(MASK, { visible: false });
  expect(visibleLayers().map(({ id }) => id)).toEqual(["moisture", "gcov-hhhh-20261021"]);
});

test("the legend of a continuous scale has its colours and its values from the lowest to the highest", () => {
  const legend = pictureLegend(BACKSCATTER);
  expect(legend.title).toBe("Backscatter HH, 21 Oct 2026");
  expect(legend.caption).toBe("Radar backscatter gamma nought, HH, linear power");
  expect(legend.classes).toEqual([]);
  expect(legend.ramp?.colours).toBe(colourScale("grey"));
  expect(legend.ramp?.colours[0]).toBe("#000000");
  expect(legend.ramp?.colours.at(-1)).toBe("#ffffff");
  expect(legend.ramp?.marks.at(0)).toEqual({ at: 0, label: "0" });
  expect(legend.ramp?.marks.at(-1)).toEqual({ at: 1, label: "0.5" });
  // The values between the two ends stand at their share of the range.
  for (const { at, label } of legend.ramp?.marks ?? []) {
    expect(at).toBeCloseTo(Number(label) / 0.5, 9);
  }
});

test("the unit stands in brackets after the quantity, written for the reader", () => {
  expect(pictureLegend(MOISTURE).caption).toBe(
    "Radar backscatter gamma nought, HH, linear power (m\u00b3 m\u207b\u00b3)",
  );
});

test("the legend follows the display that the layer has now", () => {
  mapLayersStore.set([BACKSCATTER]);
  setDisplay(BACKSCATTER, { range: [0.1, 0.3], colours: "viridis" });
  const legend = pictureLegend(BACKSCATTER);
  expect(legend.ramp?.colours).toBe(colourScale("viridis"));
  expect(legend.ramp?.marks.at(0)).toEqual({ at: 0, label: "0.1" });
  expect(legend.ramp?.marks.at(-1)).toEqual({ at: 1, label: "0.3" });
});

test("the legend of a scale of classes lists each whole number of the range with its colour", () => {
  const legend = pictureLegend(MASK);
  expect(legend.ramp).toBeNull();
  expect(legend.classes.map(({ label }) => label)).toEqual(["0", "1", "2", "3", "4"]);
  expect(legend.classes.map(({ colour }) => colour)).toEqual(colourScale("tab10").slice(0, 5));
  expect(legend.note).toBeNull();
});

test("a scale of classes with more than ten values lists ten and says that the colours repeat", () => {
  const legend = pictureLegend({ ...MASK, range: [0, 24] });
  expect(legend.classes).toHaveLength(10);
  expect(legend.note).toBe("The colours repeat every ten values.");
});
