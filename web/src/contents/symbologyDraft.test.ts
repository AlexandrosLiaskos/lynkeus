// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { firstDisplay } from "./state";
import { changeOf, draftOf, numberOf, numberText, stretchOf, type Draft } from "./symbologyDraft";

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

const coherenceDraft = (change: Partial<Draft> = {}): Draft => ({
  ...draftOf(COHERENCE, firstDisplay(COHERENCE)),
  ...change,
});

test("a number is written for a field with six significant digits, and a field is read as a number", () => {
  expect(numberText(0.0116461234)).toBe("0.0116461");
  expect(numberText(-20)).toBe("-20");
  expect(numberOf(" 0.25 ")).toBe(0.25);
  expect(numberOf("")).toBeNaN();
  expect(numberOf("abc")).toBeNaN();
});

test("the pane starts from the display of the layer", () => {
  expect(coherenceDraft()).toEqual({
    colours: "grey",
    inverted: false,
    decibels: false,
    stretch: "typed",
    percent: "2",
    deviations: "2",
    lowest: "0",
    highest: "1",
    noData: false,
    noDataColour: "#000000",
    masked: false,
    maskLowest: "0",
    maskHighest: "1",
  });
});

test("the range of a power is typed in decibels and kept in the unit of the layer", () => {
  const draft = draftOf(BACKSCATTER, firstDisplay(BACKSCATTER));
  expect(draft.decibels).toBe(true);
  expect(draft.lowest).toBe("-20");
  expect(draft.highest).toBe("-3.9794");
  const change = changeOf(BACKSCATTER, { ...draft, lowest: "-25", highest: "0" });
  expect(change).toMatchObject({ decibels: true, stretch: { kind: "typed" } });
  expect("range" in change && change.range?.[0]).toBeCloseTo(10 ** -2.5, 12);
  expect("range" in change && change.range?.[1]).toBe(1);
  // Without decibels the same texts are values of the layer.
  expect(changeOf(BACKSCATTER, { ...draft, decibels: false, lowest: "0.02", highest: "0.5" })).toMatchObject({
    decibels: false,
    range: [0.02, 0.5],
  });
});

test("the draft of another quantity changes the display without a choice of decibels", () => {
  const change = changeOf(
    COHERENCE,
    coherenceDraft({ colours: "viridis", inverted: true, lowest: "0.2", highest: "0.9" }),
  );
  expect(change).toEqual({
    colours: "viridis",
    inverted: true,
    decibels: undefined,
    range: [0.2, 0.9],
    stretch: { kind: "typed" },
    noDataColour: undefined,
    mask: undefined,
  });
});

test("the colour of the cells without data and the mask are part of the change", () => {
  const change = changeOf(
    COHERENCE,
    coherenceDraft({ noData: true, noDataColour: "#FF8800", masked: true, maskLowest: "0.3", maskHighest: "1" }),
  );
  expect(change).toMatchObject({ noDataColour: "#ff8800", mask: [0.3, 1] });
});

test("a wrong value is named with its field", () => {
  expect(changeOf(COHERENCE, coherenceDraft({ lowest: "" }))).toEqual({ field: "lowest", text: "Type a number." });
  expect(changeOf(COHERENCE, coherenceDraft({ highest: "x" }))).toEqual({ field: "highest", text: "Type a number." });
  expect(changeOf(COHERENCE, coherenceDraft({ lowest: "1", highest: "1" }))).toEqual({
    field: "highest",
    text: "The highest value must be larger than the lowest value.",
  });
  expect(changeOf(COHERENCE, coherenceDraft({ colours: "rainbow" }))).toMatchObject({ field: "colours" });
  expect(changeOf(COHERENCE, coherenceDraft({ masked: true, maskLowest: "0.5", maskHighest: "0.2" }))).toMatchObject({
    field: "maskHighest",
  });
  expect(changeOf(COHERENCE, coherenceDraft({ stretch: "percent", percent: "50" }))).toEqual({
    field: "percent",
    text: "Type a percent from 0 to below 50.",
  });
  expect(changeOf(COHERENCE, coherenceDraft({ stretch: "deviations", deviations: "0" }))).toMatchObject({
    field: "deviations",
  });
});

test("the stretch of a draft carries its number", () => {
  expect(stretchOf(coherenceDraft({ stretch: "percent", percent: "0.5" }))).toEqual({ kind: "percent", percent: 0.5 });
  expect(stretchOf(coherenceDraft({ stretch: "deviations", deviations: "2.5" }))).toEqual({
    kind: "deviations",
    count: 2.5,
  });
  expect(stretchOf(coherenceDraft({ stretch: "extremes" }))).toEqual({ kind: "extremes" });
});
