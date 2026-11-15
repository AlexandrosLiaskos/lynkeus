// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { GO_TO_FAULTS } from "../map/GoToPane";
import type { LayerDescription } from "../shared/layer";
import {
  ANGLE_FAULTS,
  checkSeries,
  daysWords,
  FEWEST_LAYERS,
  firstChoice,
  FREQUENCIES,
  isRelative,
  linksAllDates,
  majorRelease,
  missingOfSeries,
  MOST_LAYERS,
  NO_LAYERS,
  noComponentsSentence,
  noFrequencySentence,
  pairDatesOf,
  PLACES,
  READS_AS,
  REFERENCE_FAULTS,
  SERIES_TOOLS,
  seriesGroups,
  seriesTitle,
  SHEET_TOOLS,
  UNLINKED,
  type SeriesChoices,
} from "./series";
import { coherence, components, GUNW_JUL, GUNW_PAIR, GUNW_SEP, laterTerm, phase, term } from "./testLayers";
import { FINISHED_TOOLS } from "./tools";

const read = (file: string) => readFileSync(`../api/src/lynkeus/${file}`, "utf8");

const GCOV = (cycle: string, day: string, release: string) =>
  `NISAR_L2_PR_GCOV_${cycle}_141_D_067_4005_DHDH_A_${day}T234330_${day}T234405_${release}_N_F_J_001.h5`;
const GUNW = (first: string, second: string, release: string) =>
  `NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_${first}T234330_${first}T234405_${second}T234330_${second}T234405_${release}_N_F_J_001.h5`;

/** The four backscatter layers of the pilot area: two of the provisional release and two of the validated one. */
const SEP = term({
  id: "hh-sep",
  title: "Backscatter HH, 27 Sep 2026",
  dates: ["2026-09-27"],
  inputs: [GCOV("031", "20260927", "P05023")],
});
const OCT_9 = term({
  id: "hh-oct-9",
  title: "Backscatter HH, 9 Oct 2026",
  dates: ["2026-10-09"],
  inputs: [GCOV("032", "20261009", "P05023")],
});
const OCT_21 = term();
const NOV = laterTerm();
const FOUR = [NOV, SEP, OCT_21, OCT_9];

/** Three coherence layers of 20 m of the pilot area. */
const pair = (id: string, first: string, second: string, release: string): LayerDescription =>
  coherence({
    id,
    title: `Coherence HH, 20 m, ${id}`,
    layer: "wrappedInterferogram/HH/coherenceMagnitude",
    dates: [
      `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6)}`,
      `${second.slice(0, 4)}-${second.slice(4, 6)}-${second.slice(6)}`,
    ],
    inputs: [GUNW(first, second, release)],
  });
const PAIRS = [
  pair("c", "20261009", "20261021", "P05036"),
  pair("a", "20260915", "20260927", "P05023"),
  pair("b", "20260927", "20261009", "P05023"),
];

function choices(change: Partial<SeriesChoices> = {}): SeriesChoices {
  return {
    group: [SEP, OCT_9, OCT_21, NOV],
    chosen: ["hh-sep", "hh-oct-9", "hh-oct", "hh-nov"],
    place: "area",
    latitude: "",
    longitude: "",
    title: "Backscatter of the estuary",
    ...change,
  };
}

test("the Series tools are the three that the server offers, and each has a method sheet", () => {
  expect(SERIES_TOOLS).toEqual(["backscatter-series", "coherence-series", "displacement-series"]);
  expect(SHEET_TOOLS).toEqual([...FINISHED_TOOLS, ...SERIES_TOOLS]);
  expect(read("analysis/__init__.py")).toContain(
    'SERIES_TOOLS: dict[str, SeriesFunction] = {\n    "backscatter-series": backscatter_series,\n    "coherence-series": coherence_series,\n    "displacement-series": displacement_series,\n}',
  );
  for (const tool of SERIES_TOOLS) {
    expect(readFileSync(`../docs/methods/${tool}.md`, "utf8")).toContain(`| Tool | \`${tool}\` `);
  }
});

test("a Series tool reads the layers of the tool of one date, and the limits of the server on their number", () => {
  expect(READS_AS).toEqual({
    "backscatter-series": "backscatter-state",
    "coherence-series": "coherence-state",
    "displacement-series": "displacement-state",
  });
  const server = read("analysis/series.py");
  expect(server).toContain('_TERMS = re.compile(r"HHHH|HVHV|VHVH|VVVV|RHRH|RVRV")');
  expect(server).toContain(
    '_COHERENCE = re.compile(r"(?:unwrappedInterferogram|wrappedInterferogram)/(?:HH|VV)/coherenceMagnitude")',
  );
  expect(server).toContain(
    String.raw`_RELEASE = re.compile(r"_(?P<crid>(?P<major>[A-Z]\d{2})\d{3})_[A-Z]_[A-Z]_[A-Z]_\d{3}(?:\.h5)?$")`,
  );
  expect([FEWEST_LAYERS, MOST_LAYERS]).toEqual([2, 50]);
  expect(read("offered.py")).toContain(
    "    inputs: tuple[Text, ...] = Field(\n        min_length=2,\n        max_length=MAX_SESSION_LAYERS,",
  );
  expect(read("jobs.py")).toContain("MAX_SESSION_LAYERS = 50\n");
});

test("the release of a product is read from the name of its file", () => {
  expect(majorRelease(SEP)).toBe("P05");
  expect(majorRelease(NOV)).toBe("P05");
  expect(
    majorRelease(term({ inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405"] })),
  ).toBeNull();
  expect(daysWords(["2026-10-09", "2026-10-21"])).toBe("9 Oct 2026 to 21 Oct 2026");
  expect(daysWords(["2026-11-02"])).toBe("2 Nov 2026");
});

test("the layers that a tool reads together form one group, the earliest date first", () => {
  const [group, ...others] = seriesGroups("backscatter-series", [...FOUR, ...PAIRS]);
  expect(others).toEqual([]);
  expect(group?.name).toBe("HHHH, track 141, frame 67, descending, release P05");
  expect(group?.layers.map((layer) => layer.id)).toEqual(["hh-sep", "hh-oct-9", "hh-oct", "hh-nov"]);
  const [pairs] = seriesGroups("coherence-series", [...FOUR, ...PAIRS]);
  expect(pairs?.name).toBe("wrappedInterferogram/HH/coherenceMagnitude, track 141, frame 67, descending, release P05");
  expect(pairs?.layers.map((layer) => layer.id)).toEqual(["a", "b", "c"]);
});

test("layers of another term, frame or major release stand in other groups, and a group needs two dates", () => {
  const cross = [term({ id: "hv-oct", layer: "HVHV" }), laterTerm({ id: "hv-nov", layer: "HVHV" })];
  const elsewhere = term({
    id: "frame-68",
    dates: ["2026-10-21"],
    inputs: [GCOV("033", "20261021", "P05036").replace("_D_067_", "_D_068_")],
  });
  const older = [
    term({ id: "old-1", dates: ["2026-08-10"], inputs: [GCOV("027", "20260810", "P04001")] }),
    term({ id: "old-2", dates: ["2026-08-22"], inputs: [GCOV("028", "20260822", "P04002")] }),
  ];
  const twice = term({ id: "hh-oct-again", title: "Backscatter HH, 21 Oct 2026, again" });
  const groups = seriesGroups("backscatter-series", [...FOUR, ...cross, elsewhere, ...older, twice]);
  expect(groups.map((group) => [group.name, group.layers.map((layer) => layer.id)])).toEqual([
    ["HHHH, track 141, frame 67, descending, release P04", ["old-1", "old-2"]],
    ["HHHH, track 141, frame 67, descending, release P05", ["hh-sep", "hh-oct-9", "hh-oct", "hh-oct-again", "hh-nov"]],
    ["HVHV, track 141, frame 67, descending, release P05", ["hv-oct", "hv-nov"]],
  ]);
  // One layer, two layers of one date and a result of a tool give no group.
  expect(seriesGroups("backscatter-series", [OCT_21])).toEqual([]);
  expect(seriesGroups("backscatter-series", [OCT_21, twice])).toEqual([]);
  expect(seriesGroups("backscatter-series", [{ ...OCT_21, kind: "result", layer: null, method: "m" }, NOV])).toEqual(
    [],
  );
  expect(seriesGroups("coherence-series", FOUR)).toEqual([]);
});

test("the form chooses every layer of a group at first, and of two layers of one date the first", () => {
  const twice = term({ id: "hh-oct-again" });
  const [group] = seriesGroups("backscatter-series", [...FOUR, twice]);
  expect(group && firstChoice(group)).toEqual(["hh-sep", "hh-oct-9", "hh-oct", "hh-nov"]);
});

test("the name of a series is proposed from the quantity, the channel and the first and the last date", () => {
  expect(seriesTitle("backscatter-series", [SEP, OCT_9, OCT_21, NOV])).toBe(
    "Series of backscatter HH in dB, 27 Sep 2026 to 2 Nov 2026",
  );
  const [pairs] = seriesGroups("coherence-series", PAIRS);
  expect(seriesTitle("coherence-series", pairs?.layers ?? [])).toBe(
    "Series of coherence magnitude HH, 20 m, 15 Sep 2026 to 21 Oct 2026",
  );
  expect(seriesTitle("backscatter-series", [])).toBe("");
});

test("sound choices give what the form sends: the layers in the order of their dates, the name and the point", () => {
  const whole = checkSeries(choices({ chosen: ["hh-nov", "hh-sep"], title: "  A series  " }));
  expect(whole.faults).toEqual({ layers: null, latitude: null, longitude: null, title: null });
  expect(whole.inputs).toEqual({ inputs: ["hh-sep", "hh-nov"], title: "A series" });
  expect(missingOfSeries(whole.faults)).toBeNull();
  const at = checkSeries(choices({ place: "point", latitude: "42.8 N", longitude: "70.9 W" }));
  expect(at.inputs).toEqual({
    inputs: ["hh-sep", "hh-oct-9", "hh-oct", "hh-nov"],
    title: "Backscatter of the estuary",
    point: { longitude: -70.9, latitude: 42.8 },
  });
  // The point that was typed is not sent with a series of the whole area.
  expect(checkSeries(choices({ latitude: "42.8", longitude: "-70.9" })).inputs).not.toHaveProperty("point");
});

test("each field states its fault, and the foot states the first of them", () => {
  const few = checkSeries(choices({ chosen: ["hh-sep"] }));
  expect(few.faults.layers).toBe("Choose at least two layers.");
  expect(few.inputs).toBeNull();
  const many = Array.from({ length: 51 }, (_, index) =>
    term({
      id: `layer-${String(index)}`,
      dates: [
        `2026-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`,
      ],
    }),
  );
  expect(checkSeries(choices({ group: many, chosen: many.map((layer) => layer.id) })).faults.layers).toBe(
    "Choose at most 50 layers.",
  );
  const twice = term({ id: "hh-oct-again" });
  expect(
    checkSeries(choices({ group: [OCT_21, twice, NOV], chosen: ["hh-oct", "hh-oct-again", "hh-nov"] })).faults.layers,
  ).toBe("Two of the chosen layers have the same dates. Choose one of them.");
  const nowhere = checkSeries(choices({ place: "point", latitude: "", longitude: "200" }));
  expect(nowhere.faults).toEqual({
    layers: null,
    latitude: ANGLE_FAULTS.latitude,
    longitude: ANGLE_FAULTS.longitude,
    title: null,
  });
  expect(missingOfSeries(nowhere.faults)).toBe(ANGLE_FAULTS.latitude);
  expect(checkSeries(choices({ title: " " })).faults.title).toBe("Give a name.");
  expect(checkSeries(choices({ title: "a".repeat(201) })).faults.title).toBe("The name is longer than 200 characters.");
  expect(missingOfSeries({ layers: "a", latitude: "b", longitude: "c", title: "d" })).toBe("a");
  expect(missingOfSeries({ layers: null, latitude: null, longitude: "c", title: "d" })).toBe("c");
});

test("the words of the form are short, and the faults of the point are those of the pane Go to coordinates", () => {
  expect(PLACES).toEqual({ area: "Whole area", point: "At a point" });
  expect(NO_LAYERS).toBe("No two layers of this session can be used together by the tool.");
  expect(ANGLE_FAULTS).toEqual({
    latitude: "Enter the latitude in degrees, from 90 S to 90 N, for example 42.8 N or 42° 48′ 30″ N.",
    longitude: "Enter the longitude in degrees, from 180 W to 180 E, for example 70.9 W or 70° 54′ 00″ W.",
  });
  expect(ANGLE_FAULTS.latitude).toBe(GO_TO_FAULTS.latitude);
  expect(ANGLE_FAULTS.longitude).toBe(GO_TO_FAULTS.longitude);
});

/** The layers Unwrapped phase and Connected components of three pairs of the pilot area. */
const PHASE_SEP = phase({
  id: "phase-sep",
  title: "Unwrapped phase HH, 27 Sep 2026 to 9 Oct 2026",
  dates: ["2026-09-27", "2026-10-09"],
  inputs: [GUNW_SEP],
});
const PHASE_OCT = phase({ id: "phase-oct" });
const PHASE_JUL = phase({
  id: "phase-jul",
  title: "Unwrapped phase HH, 17 Jul 2026 to 10 Aug 2026",
  dates: ["2026-07-17", "2026-08-10"],
  inputs: [GUNW_JUL],
});
const LABELS_SEP = components({ id: "labels-sep", dates: ["2026-09-27", "2026-10-09"], inputs: [GUNW_SEP] });
const LABELS_OCT = components({ id: "labels-oct" });
const LABELS_JUL = components({ id: "labels-jul", dates: ["2026-07-17", "2026-08-10"], inputs: [GUNW_JUL] });
const SESSION = [PHASE_OCT, LABELS_OCT, PHASE_SEP, LABELS_SEP, PHASE_JUL, LABELS_JUL];

function relative(change: Partial<SeriesChoices> = {}, session = SESSION): SeriesChoices {
  return {
    group: [PHASE_SEP, PHASE_OCT],
    chosen: ["phase-sep", "phase-oct"],
    place: "area",
    latitude: "42.8",
    longitude: "-71.0",
    title: "Displacement at the bridge",
    relative: { session, latitude: "42.7761", longitude: "71.0772 W" },
    ...change,
  };
}

test("only Surface displacement, Series is relative to a reference point, and it reads the layers of One pair", () => {
  expect(SERIES_TOOLS.filter(isRelative)).toEqual(["displacement-series"]);
  const [group, ...others] = seriesGroups("displacement-series", SESSION);
  expect(others).toEqual([]);
  expect(group?.name).toBe("unwrappedInterferogram/HH/unwrappedPhase, track 141, frame 67, descending, release P05");
  expect(group?.layers.map((layer) => layer.id)).toEqual(["phase-jul", "phase-sep", "phase-oct"]);
  expect(seriesTitle("displacement-series", [PHASE_SEP, PHASE_OCT])).toBe(
    "Series of surface displacement HH, 27 Sep 2026 to 21 Oct 2026",
  );
});

test("a series relative to a reference point sends each phase with its connected components, the point and the reference", () => {
  const sound = checkSeries(relative());
  expect(sound.faults).toEqual({
    layers: null,
    latitude: null,
    longitude: null,
    referenceLatitude: null,
    referenceLongitude: null,
    title: null,
  });
  expect(sound.inputs).toEqual({
    inputs: ["phase-sep", "labels-sep", "phase-oct", "labels-oct"],
    title: "Displacement at the bridge",
    point: { longitude: -71, latitude: 42.8 },
    reference: { longitude: -71.0772, latitude: 42.7761 },
  });
  // The place is always the point, whatever the choice of the place holds.
  expect(checkSeries(relative({ place: "point" })).inputs).toEqual(sound.inputs);
});

test("the layers of a series relative to a reference point state the first fault of the server", () => {
  const silent = { ...PHASE_OCT, frequency: null };
  expect(checkSeries(relative({ group: [PHASE_SEP, silent] })).faults.layers).toBe(noFrequencySentence(silent));
  expect(noFrequencySentence(PHASE_OCT)).toBe(
    'The layer "Unwrapped phase HH, 9 Oct 2026 to 21 Oct 2026" does not record the frequency of the radar, so get it again with Get layer.',
  );
  const alone = checkSeries(relative({}, [PHASE_OCT, PHASE_SEP, LABELS_SEP]));
  expect(alone.faults.layers).toBe(noComponentsSentence(PHASE_OCT));
  expect(alone.inputs).toBeNull();
  const wider = { ...PHASE_OCT, frequency: 1257500000 };
  expect(checkSeries(relative({ group: [PHASE_SEP, wider] })).faults.layers).toBe(FREQUENCIES);
  const gap = checkSeries(relative({ group: [PHASE_JUL, PHASE_SEP], chosen: ["phase-jul", "phase-sep"] }));
  expect(gap.faults.layers).toBe(UNLINKED);
  expect(UNLINKED).toBe(
    "The chosen pairs do not link all their dates into one network, so add a pair that joins them.",
  );
  const nowhere = checkSeries(relative({ relative: { session: SESSION, latitude: "", longitude: "200" } }));
  expect([nowhere.faults.referenceLatitude, nowhere.faults.referenceLongitude]).toEqual([
    REFERENCE_FAULTS.latitude,
    REFERENCE_FAULTS.longitude,
  ]);
  expect(missingOfSeries(nowhere.faults)).toBe(REFERENCE_FAULTS.latitude);
  expect(missingOfSeries({ ...nowhere.faults, referenceLatitude: null })).toBe(REFERENCE_FAULTS.longitude);
});

test("the dates of a pair are read from the name of its file, and pairs link their dates through shared dates", () => {
  expect(pairDatesOf(GUNW_PAIR)).toEqual(["2026-10-09", "2026-10-21"]);
  expect(pairDatesOf(GUNW_JUL)).toEqual(["2026-07-17", "2026-08-10"]);
  expect(pairDatesOf("gunw.tif")).toEqual([]);
  expect(read("analysis/displacement.py")).toContain(
    String.raw`_TIMES = re.compile(r"_(\d{8}T\d{6})_\d{8}T\d{6}_(\d{8}T\d{6})_\d{8}T\d{6}_")`,
  );
  expect(
    linksAllDates([
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
    ]),
  ).toBe(true);
  expect(
    linksAllDates([
      ["c", "d"],
      ["a", "b"],
      ["b", "c"],
    ]),
  ).toBe(true);
  expect(
    linksAllDates([
      ["a", "b"],
      ["c", "d"],
    ]),
  ).toBe(false);
  expect(
    linksAllDates([
      ["a", "b"],
      ["c", "d"],
      ["a", "d"],
    ]),
  ).toBe(true);
});
