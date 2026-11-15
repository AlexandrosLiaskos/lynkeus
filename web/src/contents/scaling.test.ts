// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { inDecibels, isLinearPower, shownRange, shownUnit } from "./scaling";
import { firstDisplay } from "./state";

const BACKSCATTER: LayerDescription = {
  id: "backscatter",
  title: "Backscatter HH",
  kind: "layer",
  url: "/files/backscatter/backscatter.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  unit: "1",
  range: [0.01, 0.4],
  colours: "grey",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L2_PR_GCOV"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/backscatter/backscatter.json",
};

const COHERENCE: LayerDescription = {
  ...BACKSCATTER,
  id: "coherence",
  quantity: "Interferometric coherence magnitude, HH",
  range: [0, 1],
};

test("the backscatter of a GCOV product is a power on a linear scale, and coherence is not", () => {
  expect(isLinearPower(BACKSCATTER)).toBe(true);
  expect(isLinearPower(COHERENCE)).toBe(false);
  expect(isLinearPower({ ...BACKSCATTER, unit: "dB" })).toBe(false);
});

test("a power is shown in decibels until its display says otherwise", () => {
  const display = firstDisplay(BACKSCATTER);
  expect(inDecibels(BACKSCATTER, display)).toBe(true);
  expect(shownUnit(BACKSCATTER, display)).toBe("dB");
  const [lowest, highest] = shownRange(BACKSCATTER, display);
  expect(lowest).toBeCloseTo(-20, 10);
  expect(highest).toBeCloseTo(-3.979400086720376, 10);
  expect(inDecibels(BACKSCATTER, { ...display, decibels: false })).toBe(false);
  expect(shownRange(BACKSCATTER, { ...display, decibels: false })).toEqual([0.01, 0.4]);
});

test("a range that starts at zero or below is shown on the linear scale", () => {
  const display = { ...firstDisplay(BACKSCATTER), range: [0, 0.4] as const };
  expect(inDecibels(BACKSCATTER, display)).toBe(false);
  expect(shownRange(BACKSCATTER, display)).toEqual([0, 0.4]);
  expect(shownUnit(BACKSCATTER, display)).toBe("");
});

test("another quantity keeps its unit and its range", () => {
  const display = firstDisplay(COHERENCE);
  expect(inDecibels(COHERENCE, display)).toBe(false);
  expect(inDecibels(COHERENCE, { ...display, decibels: true })).toBe(false);
  expect(shownRange(COHERENCE, display)).toEqual([0, 1]);
  expect(shownUnit({ ...COHERENCE, unit: "rad" }, display)).toBe("rad");
});
