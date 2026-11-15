import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  coherence,
  earlierPair,
  GCOV_NOV,
  GCOV_OCT,
  GUNW_JUL,
  GUNW_PAIR,
  GUNW_SEP,
  laterPair,
  laterSoil,
  laterTerm,
  longPair,
  SME2_OCT,
  SME2_SEP,
  soil,
  term,
} from "./testLayers";
import {
  accepted,
  acquisitionOf,
  acquisitionWords,
  BACKSCATTER_TERMS,
  bandwidthModeOf,
  check,
  compared,
  comparisonOf,
  datesWords,
  defaultTitle,
  FINISHED_TOOLS,
  inOrder,
  layerOption,
  matches,
  missingOf,
  modesSentence,
  MOST_TITLE,
  NO_OTHER_PAIR,
  NO_PARTNER,
  OVERLAP,
  pairsInOrder,
  partners,
  READS,
  SAME_DATE,
  SOIL_MOISTURE_LAYER,
  SOIL_MOISTURE_UNIT,
  spanOf,
  spansSentence,
  unfit,
  unnamed,
} from "./tools";

test("the finished tools are the six tools that the server offers, under the names of their buttons", () => {
  expect(FINISHED_TOOLS).toEqual([
    "backscatter-state",
    "backscatter-change",
    "coherence-state",
    "coherence-change",
    "soil-moisture-state",
    "soil-moisture-change",
  ]);
  // The list of the server, in `api/src/lynkeus/analysis/__init__.py`, holds the same names in the same order.
  const [, listed = ""] =
    /^TOOLS: dict\[str, AnalysisFunction\] = \{\n([\s\S]*?)^\}/m.exec(
      readFileSync("../api/src/lynkeus/analysis/__init__.py", "utf8"),
    ) ?? [];
  expect(Array.from(listed.matchAll(/^ {4}"([^"]+)":/gm), ([, name]) => name)).toEqual([...FINISHED_TOOLS]);
});

test("the acquisition is read from the names of the product files of the pilot area", () => {
  expect(acquisitionOf(GCOV_OCT)).toEqual({ instrument: "L", product: "GCOV", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(GCOV_NOV)).toEqual({ instrument: "L", product: "GCOV", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(GUNW_PAIR)).toEqual({ instrument: "L", product: "GUNW", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(GUNW_SEP)).toEqual({ instrument: "L", product: "GUNW", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(SME2_SEP)).toEqual({ instrument: "L", product: "SME2", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(SME2_OCT)).toEqual({ instrument: "L", product: "SME2", track: 141, direction: "D", frame: 67 });
});

test("the acquisition is read from the examples of the naming conventions", () => {
  // SDS Product File Naming Conventions, JPL D-102255 Rev C, the examples of sections 3.7 and 3.8.
  expect(
    acquisitionOf("NISAR_L2_PR_GCOV_001_005_A_219_4020_SHNA_A_20220104T182346_20220104T183426_P01101_M_P_J_001.h5"),
  ).toEqual({ instrument: "L", product: "GCOV", track: 5, direction: "A", frame: 219 });
  expect(
    acquisitionOf(
      "NISAR_L2_PR_GUNW_001_005_A_219_220_4020_QP_20220116T182346_20220116T182539_20220104T182346_20220104T182539_P01101_M_F_J_001.h5",
    ),
  ).toEqual({ instrument: "L", product: "GUNW", track: 5, direction: "A", frame: 219 });
});

test("a name that does not begin as the name of a NISAR product file gives no acquisition", () => {
  expect(acquisitionOf("")).toBeNull();
  expect(acquisitionOf("gcov-hhhh-20261021.tif")).toBeNull();
  expect(acquisitionOf(`files/${GCOV_OCT}`)).toBeNull();
  expect(acquisitionOf("NISAR_L2_XX_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330")).toBeNull();
  expect(acquisitionOf("NISAR_L2_PR_GCOV_033_141_X_067_4005_DHDH_A_20261021T234330")).toBeNull();
});

test("the backscatter tools read every diagonal term of a GCOV product", () => {
  for (const name of BACKSCATTER_TERMS) {
    expect(unfit("backscatter-state", term({ layer: name }))).toBeNull();
    expect(unfit("backscatter-change", term({ layer: name }))).toBeNull();
  }
  expect(BACKSCATTER_TERMS).toEqual(["HHHH", "HVHV", "VHVH", "VVVV", "RHRH", "RVRV"]);
});

test("the layers that the tools read are the layers that the server accepts", () => {
  // The patterns of the server, in the files of the three tools. A change there is repeated in `tools.ts`.
  const server = (file: string) => readFileSync(`../api/src/lynkeus/analysis/${file}.py`, "utf8");
  expect(server("backscatter")).toContain(`_TERMS = re.compile(r"${BACKSCATTER_TERMS.join("|")}")`);
  expect(server("backscatter")).toContain('count=1, product="GCOV", names=_TERMS, reads=_READS, dates=1)');
  expect(server("backscatter")).toContain('count=2, product="GCOV", names=_TERMS, reads=_READS, dates=1)');
  expect(server("coherence")).toContain(
    '_COHERENCE = re.compile(r"(?:unwrappedInterferogram|wrappedInterferogram)/(?:HH|VV)/coherenceMagnitude")',
  );
  expect(server("coherence")).toMatch(/count=1, product="GUNW", names=_COHERENCE, reads="[^"]+", dates=2\s*\)/);
  expect(server("inputs")).toContain('r"NISAR_(?P<instrument>[LS])\\d_(?:PR|UR|OD)_(?P<product>[A-Z0-9]{4})_\\d{3}_"');
  expect(server("inputs")).toContain('r"(?P<track>\\d{3})_(?P<direction>[AD])_(?P<frame>\\d{3})_"');
  expect(server("inputs")).toContain("names.fullmatch(layer.layer)");
  expect(server("inputs")).toContain("receive it again with Get layer.");
  expect(server("coherence")).toContain(
    'check_inputs(arrays, layers, count=2, product="GUNW", names=_COHERENCE, reads=_READS, dates=2)',
  );
  expect(server("soil_moisture")).toContain(`_LAYER = re.compile(r"${SOIL_MOISTURE_LAYER}")`);
  expect(server("soil_moisture")).toContain(`_UNIT = "${SOIL_MOISTURE_UNIT}"`);
  expect(server("soil_moisture")).toContain(
    'check_inputs(arrays, layers, count=1, product="SME2", names=_LAYER, reads=_READS, dates=1, unit=_UNIT)',
  );
  expect(server("soil_moisture")).toContain(
    'arrays, layers, count=2, product="SME2", names=_LAYER, reads=_READS, dates=1, unit=_UNIT\n',
  );
  expect(server("inputs")).toContain('    unit: str = "1",\n');
  expect(server("inputs")).toContain("if layer.unit != unit:");
});

test("the comparisons that the form refuses are refusals of the server, made in the same order", () => {
  const coherenceTools = readFileSync("../api/src/lynkeus/analysis/coherence.py", "utf8");
  const soilTools = readFileSync("../api/src/lynkeus/analysis/soil_moisture.py", "utf8");
  // The pattern of the bandwidth mode code, which `bandwidthModeOf` repeats.
  expect(coherenceTools).toContain(
    '_PAIR_FILE = re.compile(r"NISAR_[LS]\\d_[A-Z]{2}_[A-Z0-9]{4}_\\d{3}_\\d{3}_[AD]_\\d{3}_\\d{3}_(?P<mode>\\d{4})_")',
  );
  const places = [
    "if layers[0].layer != layers[1].layer:",
    "if earlier != later:",
    "if first_mode != second_mode:",
    "if max(layers[0].dates) > min(layers[1].dates):",
    "if spans[0] != spans[1]:",
  ].map((line) => coherenceTools.indexOf(line, coherenceTools.indexOf("def coherence_change")));
  expect(places.every((place) => place > 0)).toBe(true);
  expect(places).toEqual([...places].sort((one, other) => one - other));
  expect(coherenceTools).toContain("days = (max(layer.dates) - min(layer.dates)).days");
  const change = soilTools.slice(soilTools.indexOf("def soil_moisture_change"));
  expect(change.indexOf("if earlier != later:")).toBeGreaterThan(0);
  expect(change.indexOf("if not layers[0].dates[0] < layers[1].dates[0]:")).toBeGreaterThan(
    change.indexOf("if earlier != later:"),
  );
});

test("the form sends what the process of a tool takes, and its longest name is the longest of the server", () => {
  const offered = readFileSync("../api/src/lynkeus/offered.py", "utf8");
  expect(offered).toContain("class ToolInputs(Format):");
  expect(offered).toContain("    inputs: tuple[Text, ...] = Field(");
  expect(offered).toContain(
    "    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TITLE_LENGTH)] = Field(",
  );
  expect(readFileSync("../api/src/lynkeus/routes.py", "utf8")).toContain(`MAX_TITLE_LENGTH = ${String(MOST_TITLE)}\n`);
  const sent = check({
    tool: "backscatter-state",
    layers: [term()],
    first: "hh-oct",
    second: null,
    title: "Name",
  }).inputs;
  expect(Object.keys(sent ?? {}).sort()).toEqual(["inputs", "title"]);
});

test("the backscatter tools do not read the other layers of a GCOV product that carry the unit 1", () => {
  for (const name of ["rtcGammaToSigmaFactor", "numberOfLooks", "mask", "HHHV", "hhhh", ""]) {
    expect(unfit("backscatter-state", term({ layer: name }))).toBe("name");
    expect(unfit("backscatter-change", term({ layer: name }))).toBe("name");
  }
});

test("Coherence, One pair reads the layer coherenceMagnitude of a GUNW product at its two spacings", () => {
  for (const name of [
    "unwrappedInterferogram/HH/coherenceMagnitude",
    "unwrappedInterferogram/VV/coherenceMagnitude",
    "wrappedInterferogram/HH/coherenceMagnitude",
    "wrappedInterferogram/VV/coherenceMagnitude",
  ]) {
    expect(unfit("coherence-state", coherence({ layer: name }))).toBeNull();
  }
});

test("Coherence, One pair does not read the other layers of a GUNW product", () => {
  for (const name of [
    "unwrappedInterferogram/HH/connectedComponents",
    "unwrappedInterferogram/HH/unwrappedPhase",
    "pixelOffsets/HH/correlationSurfacePeak",
    "unwrappedInterferogram/HV/coherenceMagnitude",
    "wrappedInterferogram/HH/coherenceMagnitude/",
    "coherenceMagnitude",
  ]) {
    expect(unfit("coherence-state", coherence({ layer: name }))).toBe("name");
  }
});

test("Coherence, Change reads the layers that Coherence, One pair reads", () => {
  for (const name of [
    "unwrappedInterferogram/HH/coherenceMagnitude",
    "unwrappedInterferogram/VV/coherenceMagnitude",
    "wrappedInterferogram/HH/coherenceMagnitude",
    "wrappedInterferogram/VV/coherenceMagnitude",
  ]) {
    expect(unfit("coherence-change", coherence({ layer: name }))).toBeNull();
  }
  expect(unfit("coherence-change", coherence({ layer: "unwrappedInterferogram/HH/unwrappedPhase" }))).toBe("name");
  expect(unfit("coherence-change", coherence({ dates: ["2026-10-21"] }))).toBe("dates");
  expect(unfit("coherence-change", term())).toBe("product");
});

test("the soil moisture tools read the layer soilMoisture of an SME2 product, with its unit", () => {
  expect(SOIL_MOISTURE_LAYER).toBe("soilMoisture");
  expect(SOIL_MOISTURE_UNIT).toBe("m3 m-3");
  for (const tool of ["soil-moisture-state", "soil-moisture-change"] as const) {
    expect(unfit(tool, soil())).toBeNull();
    expect(unfit(tool, laterSoil())).toBeNull();
    // The Data part offers the layer of the uncertainty with the same unit, and the tools do not read it.
    expect(unfit(tool, soil({ layer: "soilMoistureUncertainty" }))).toBe("name");
    expect(unfit(tool, soil({ layer: "algorithmCandidates/PMI/soilMoisture" }))).toBe("name");
    expect(unfit(tool, soil({ unit: "1" }))).toBe("unit");
    expect(unfit(tool, soil({ dates: ["2026-09-27", "2026-10-09"] }))).toBe("dates");
    expect(unfit(tool, soil({ layer: null }))).toBe("unnamed");
    expect(unfit(tool, term())).toBe("product");
    expect(unfit(tool, coherence())).toBe("product");
  }
  expect(unfit("backscatter-state", soil())).toBe("product");
  expect(unfit("coherence-state", soil())).toBe("product");
});

test("a layer is not read when it was not received from one product of the type of the tool", () => {
  expect(unfit("backscatter-state", term({ kind: "result", method: "A method" }))).toBe("product");
  expect(unfit("backscatter-state", term({ inputs: [GCOV_OCT, GCOV_NOV] }))).toBe("product");
  expect(unfit("backscatter-state", term({ inputs: ["gcov-hhhh-20261021.tif"] }))).toBe("product");
  expect(unfit("backscatter-state", coherence())).toBe("product");
  expect(unfit("backscatter-change", coherence())).toBe("product");
  expect(unfit("coherence-state", term())).toBe("product");
});

test("the faults of a layer are found in the order of the server", () => {
  const wrong = { unit: "dB", dates: ["2026-10-21", "2026-11-02"] };
  expect(unfit("backscatter-state", term({ ...wrong, layer: null, inputs: ["other.tif"] }))).toBe("product");
  expect(unfit("backscatter-state", term({ ...wrong, layer: null }))).toBe("unnamed");
  expect(unfit("backscatter-state", term({ ...wrong, layer: "mask" }))).toBe("name");
  expect(unfit("backscatter-state", term(wrong))).toBe("unit");
  expect(unfit("backscatter-state", term({ dates: wrong.dates }))).toBe("dates");
});

test("a layer is not read when its unit is not 1 or it does not have the number of dates of the tool", () => {
  expect(unfit("backscatter-state", term({ unit: "dB" }))).toBe("unit");
  expect(unfit("coherence-state", coherence({ unit: "rad" }))).toBe("unit");
  expect(unfit("backscatter-state", term({ dates: ["2026-10-21", "2026-11-02"] }))).toBe("dates");
  expect(unfit("coherence-state", coherence({ dates: ["2026-10-21"] }))).toBe("dates");
});

test("a layer whose description does not hold its name inside the product is not read, and is counted", () => {
  const old = term({ id: "old", layer: undefined });
  expect(unfit("backscatter-state", old)).toBe("unnamed");
  expect(unfit("backscatter-state", term({ layer: null }))).toBe("unnamed");
  expect(accepted("backscatter-state", [old, term()])).toEqual([term()]);
  expect(unnamed("backscatter-state", [old, term(), coherence({ layer: undefined })])).toBe(1);
  expect(unnamed("coherence-state", [old, term(), coherence({ layer: undefined })])).toBe(1);
  expect(unnamed("backscatter-state", [term()])).toBe(0);
  // A layer without a name that the tool could not read for its unit or its dates is not counted.
  expect(unnamed("backscatter-state", [term({ layer: null, unit: "dB" })])).toBe(0);
  expect(unnamed("coherence-state", [coherence({ layer: null, dates: ["2026-10-21"] })])).toBe(0);
  // The unit of the tool counts: a soil moisture layer without a name is counted by the soil moisture tools only.
  expect(unnamed("soil-moisture-change", [soil({ layer: null }), laterSoil({ layer: undefined }), soil()])).toBe(2);
  expect(unnamed("soil-moisture-state", [soil({ layer: null, unit: "1" })])).toBe(0);
  expect(unnamed("coherence-change", [earlierPair({ layer: null }), laterPair()])).toBe(1);
});

test("the layers that a tool reads keep the order of the list", () => {
  const layers = [laterTerm(), coherence(), term(), term({ id: "looks", layer: "numberOfLooks" })];
  expect(accepted("backscatter-change", layers).map(({ id }) => id)).toEqual(["hh-nov", "hh-oct"]);
  expect(accepted("coherence-state", layers).map(({ id }) => id)).toEqual(["coherence-80"]);
});

test("two layers match when they are the same term of products of the same instrument, track, direction and frame", () => {
  expect(matches(term(), laterTerm())).toBe(true);
  expect(matches(laterTerm(), term())).toBe(true);
});

test("two layers do not match when one of these differs, or when they are one layer", () => {
  const other = (change: string, to: string) => laterTerm({ inputs: [GCOV_NOV.replace(change, to)] });
  expect(matches(term(), term())).toBe(false);
  expect(matches(term(), laterTerm({ layer: "HVHV" }))).toBe(false);
  expect(matches(term(), other("NISAR_L2", "NISAR_S2"))).toBe(false);
  expect(matches(term(), other("_141_D_067_", "_142_D_067_"))).toBe(false);
  expect(matches(term(), other("_141_D_067_", "_141_A_067_"))).toBe(false);
  expect(matches(term(), other("_141_D_067_", "_141_D_068_"))).toBe(false);
  expect(matches(term({ layer: undefined }), laterTerm({ layer: undefined }))).toBe(false);
  expect(matches(term({ layer: null }), laterTerm({ layer: null }))).toBe(false);
});

test("two layers of the same term and acquisition match whatever the cycle of their products", () => {
  expect(matches(term(), laterTerm({ inputs: [GCOV_NOV.replace("_GCOV_034_", "_GCOV_040_")] }))).toBe(true);
});

test("the second field offers the layers that the tool reads and that match the first", () => {
  const layers = [
    term(),
    laterTerm(),
    laterTerm({ id: "hv-nov", layer: "HVHV" }),
    laterTerm({ id: "looks-nov", layer: "numberOfLooks" }),
    laterTerm({ id: "other-frame", inputs: [GCOV_NOV.replace("_141_D_067_", "_141_D_068_")] }),
    coherence(),
  ];
  expect(partners("backscatter-change", term(), layers).map(({ id }) => id)).toEqual(["hh-nov"]);
  expect(partners("backscatter-change", term(), [term()])).toEqual([]);
});

test("the second field of each tool that compares offers the layers of that tool only", () => {
  const layers = [
    term(),
    laterTerm(),
    coherence(),
    earlierPair(),
    laterPair(),
    longPair(),
    laterPair({ id: "pair-vv", layer: "wrappedInterferogram/VV/coherenceMagnitude" }),
    laterPair({ id: "pair-68", inputs: [GUNW_PAIR.replace("_141_D_067_", "_141_D_068_")] }),
    soil(),
    laterSoil(),
    laterSoil({ id: "soil-104", inputs: [SME2_OCT.replace("_141_D_067_", "_104_A_067_")] }),
    laterSoil({ id: "uncertainty", layer: "soilMoistureUncertainty" }),
  ];
  expect(partners("coherence-change", earlierPair(), layers).map(({ id }) => id)).toEqual(["pair-oct", "pair-jul"]);
  // The 80 m layer of a product does not stand beside its 20 m layer.
  expect(partners("coherence-change", coherence(), layers)).toEqual([]);
  expect(partners("soil-moisture-change", soil(), layers).map(({ id }) => id)).toEqual(["soil-oct"]);
  expect(partners("soil-moisture-change", soil(), [soil()])).toEqual([]);
});

test("a tool of two inputs compares two dates or two pairs of dates, and a tool of one input compares nothing", () => {
  expect(Object.fromEntries(FINISHED_TOOLS.map((tool) => [tool, comparisonOf(tool)]))).toEqual({
    "backscatter-state": null,
    "backscatter-change": "dates",
    "coherence-state": null,
    "coherence-change": "pairs",
    "soil-moisture-state": null,
    "soil-moisture-change": "dates",
  });
});

test("the bandwidth mode code is read from the name of the product file of a pair", () => {
  expect(bandwidthModeOf(GUNW_PAIR)).toBe("4000");
  expect(bandwidthModeOf(GUNW_SEP)).toBe("4000");
  expect(bandwidthModeOf(GUNW_JUL)).toBe("4000");
  // SDS Product File Naming Conventions, JPL D-102255 Rev C, the example of section 3.8.
  expect(
    bandwidthModeOf(
      "NISAR_L2_PR_GUNW_001_005_A_219_220_4020_QP_20220116T182346_20220116T182539_20220104T182346_20220104T182539_P01101_M_F_J_001.h5",
    ),
  ).toBe("4020");
  // The name of a product of one date holds no second cycle number, and the two short names are those of the
  // tests of the server.
  expect(bandwidthModeOf(GCOV_OCT)).toBeNull();
  expect(bandwidthModeOf("NISAR_L2_PR_GUNW_032_141_D_067_")).toBeNull();
  expect(bandwidthModeOf("NISAR_L2_PR_GUNW_032_141_D_067_033_40_SH_2026")).toBeNull();
  expect(bandwidthModeOf("")).toBeNull();
});

test("the earlier pair of dates is put first, in whichever order the two layers are given", () => {
  // Two pairs that share a date, and two pairs that are apart in time.
  expect(pairsInOrder(earlierPair(), laterPair())?.map(({ id }) => id)).toEqual(["pair-sep", "pair-oct"]);
  expect(pairsInOrder(laterPair(), earlierPair())?.map(({ id }) => id)).toEqual(["pair-sep", "pair-oct"]);
  expect(pairsInOrder(laterPair(), longPair())?.map(({ id }) => id)).toEqual(["pair-jul", "pair-oct"]);
  // The dates of a layer are read whichever their order in the description.
  expect(pairsInOrder(laterPair({ dates: ["2026-10-21", "2026-10-09"] }), earlierPair())?.map(({ id }) => id)).toEqual([
    "pair-sep",
    "pair-oct",
  ]);
});

test("two pairs of dates whose intervals overlap have no order", () => {
  expect(pairsInOrder(laterPair(), laterPair({ id: "again" }))).toBeNull();
  expect(pairsInOrder(earlierPair(), laterPair({ dates: ["2026-10-03", "2026-10-15"] }))).toBeNull();
  expect(pairsInOrder(laterPair({ dates: ["2026-09-27", "2026-10-21"] }), earlierPair())).toBeNull();
});

test("the span of a layer is the number of days between its first and its last date", () => {
  expect(spanOf(laterPair())).toBe(12);
  expect(spanOf(earlierPair())).toBe(12);
  expect(spanOf(longPair())).toBe(24);
  expect(spanOf(laterPair({ dates: ["2026-12-26", "2027-01-07"] }))).toBe(12);
  expect(spanOf(laterPair({ dates: ["2028-02-20", "2028-03-03"] }))).toBe(12);
  expect(spanOf(soil())).toBe(0);
});

test("two layers of two dates are compared with the earlier date first, and not when they have one date", () => {
  expect(compared("backscatter-change", laterTerm(), term())).toEqual([term(), laterTerm()]);
  expect(compared("soil-moisture-change", laterSoil(), soil())).toEqual([soil(), laterSoil()]);
  expect(compared("backscatter-change", term(), term({ id: "again" }))).toBe(SAME_DATE);
  expect(compared("soil-moisture-change", soil(), soil({ id: "again" }))).toBe(SAME_DATE);
  expect(SAME_DATE).toBe("Choose a layer of another date.");
});

test("two pairs of dates are compared with the earlier pair first when the server would compare them", () => {
  expect(compared("coherence-change", laterPair(), earlierPair())).toEqual([earlierPair(), laterPair()]);
  expect(compared("coherence-change", earlierPair(), laterPair())).toEqual([earlierPair(), laterPair()]);
  // Two pairs of 12 days that are apart in time.
  const august = earlierPair({ id: "pair-aug", dates: ["2026-08-10", "2026-08-22"] });
  expect(compared("coherence-change", laterPair(), august)).toEqual([august, laterPair()]);
});

test("two pairs that the server would refuse are refused in one sentence that says why", () => {
  const other = laterPair({ id: "mode-2000", inputs: [GUNW_PAIR.replace("_033_4000_SH_", "_033_2000_SH_")] });
  expect(compared("coherence-change", earlierPair(), other)).toBe(
    "The two pairs were acquired with different radar bandwidths (mode codes 4000 and 2000), and the tool compares pairs of one bandwidth.",
  );
  expect(compared("coherence-change", laterPair(), laterPair({ id: "again" }))).toBe(
    "Choose a pair of dates that does not overlap the pair of the first layer.",
  );
  expect(compared("coherence-change", earlierPair(), laterPair({ dates: ["2026-10-03", "2026-10-15"] }))).toBe(OVERLAP);
  expect(compared("coherence-change", laterPair(), longPair())).toBe(
    "The two pairs span 24 and 12 days, and the tool compares pairs of the same number of days.",
  );
  expect(compared("coherence-change", longPair(), laterPair())).toBe(spansSentence(24, 12));
  // The checks stand in the order of the server: the bandwidth, then the order of the pairs, then their spans.
  expect(compared("coherence-change", other, laterPair())).toBe(modesSentence("2000", "4000"));
  expect(compared("coherence-change", longPair(), other)).toBe(modesSentence("4000", "2000"));
  for (const sentence of [SAME_DATE, OVERLAP, modesSentence("4000", "2000"), spansSentence(24, 12)]) {
    expect(sentence).toMatch(/^[A-Z][^.]*\.$/);
  }
});

test("the dates of the inputs are written in the order of the tool", () => {
  expect(datesWords("backscatter-state", [term()])).toBe("21 Oct 2026");
  expect(datesWords("backscatter-change", [term(), laterTerm()])).toBe("21 Oct 2026 to 2 Nov 2026");
  // The interface writes a day with `formatDay`, which shortens September to "Sept".
  expect(datesWords("soil-moisture-change", [soil(), laterSoil()])).toBe("27 Sept 2026 to 9 Oct 2026");
  expect(datesWords("coherence-state", [coherence()])).toBe("9 Oct 2026 to 21 Oct 2026");
  expect(datesWords("coherence-change", [earlierPair(), laterPair()])).toBe(
    "27 Sept 2026 to 9 Oct 2026, then 9 Oct 2026 to 21 Oct 2026",
  );
});

test("the layer of the earlier date is put first, in whichever order the two layers are given", () => {
  expect(inOrder(term(), laterTerm())?.map(({ id }) => id)).toEqual(["hh-oct", "hh-nov"]);
  expect(inOrder(laterTerm(), term())?.map(({ id }) => id)).toEqual(["hh-oct", "hh-nov"]);
  expect(
    inOrder(term({ id: "december", dates: ["2025-12-31"] }), term({ id: "january", dates: ["2026-01-01"] }))?.map(
      ({ id }) => id,
    ),
  ).toEqual(["december", "january"]);
});

test("two layers of the same date have no order", () => {
  expect(inOrder(term(), term({ id: "again" }))).toBeNull();
});

test("a layer is named in a list by its name and the acquisition of its product", () => {
  expect(acquisitionWords(term())).toBe("track 141, frame 67, descending");
  expect(layerOption(term())).toBe("Backscatter HH, 21 Oct 2026 (track 141, frame 67, descending)");
  expect(layerOption(term({ inputs: [GCOV_OCT.replace("_141_D_067_", "_005_A_219_")] }))).toBe(
    "Backscatter HH, 21 Oct 2026 (track 5, frame 219, ascending)",
  );
  expect(layerOption(term({ inputs: ["other.tif"] }))).toBe("Backscatter HH, 21 Oct 2026");
});

test("the proposed name of a result states the quantity, the channel and the date or dates", () => {
  expect(defaultTitle("backscatter-state", [term()])).toBe("Backscatter HH in dB, 21 Oct 2026");
  expect(defaultTitle("backscatter-state", [term({ layer: "HVHV" })])).toBe("Backscatter HV in dB, 21 Oct 2026");
  expect(defaultTitle("backscatter-change", [term(), laterTerm()])).toBe(
    "Change of backscatter HH in dB, 21 Oct 2026 to 2 Nov 2026",
  );
  expect(defaultTitle("coherence-state", [coherence()])).toBe(
    "Coherence magnitude HH, 80 m, 9 Oct 2026 to 21 Oct 2026",
  );
  expect(defaultTitle("coherence-state", [coherence({ layer: "wrappedInterferogram/VV/coherenceMagnitude" })])).toBe(
    "Coherence magnitude VV, 20 m, 9 Oct 2026 to 21 Oct 2026",
  );
  expect(defaultTitle("coherence-change", [earlierPair(), laterPair()])).toBe(
    "Change of coherence magnitude HH, 20 m, 27 Sept 2026 to 9 Oct 2026, then 9 Oct 2026 to 21 Oct 2026",
  );
  expect(defaultTitle("soil-moisture-state", [soil()])).toBe("Volumetric soil moisture, 27 Sept 2026");
  expect(defaultTitle("soil-moisture-change", [soil(), laterSoil()])).toBe(
    "Change of soil moisture, 27 Sept 2026 to 9 Oct 2026",
  );
});

test("no name is proposed while an input layer is missing", () => {
  expect(defaultTitle("backscatter-state", [])).toBe("");
  expect(defaultTitle("backscatter-change", [term()])).toBe("");
  expect(defaultTitle("coherence-state", [])).toBe("");
  expect(defaultTitle("coherence-change", [earlierPair()])).toBe("");
  expect(defaultTitle("soil-moisture-state", [])).toBe("");
  expect(defaultTitle("soil-moisture-change", [soil()])).toBe("");
});

test("every proposed name is a name that the server takes", () => {
  for (const title of [
    defaultTitle("backscatter-state", [term()]),
    defaultTitle("backscatter-change", [term(), laterTerm()]),
    defaultTitle("coherence-state", [coherence()]),
    defaultTitle("coherence-change", [earlierPair(), laterPair()]),
    defaultTitle("soil-moisture-state", [soil()]),
    defaultTitle("soil-moisture-change", [soil(), laterSoil()]),
  ]) {
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(MOST_TITLE);
  }
});

const SOUND = { first: null, second: null, title: null };

test("a tool of one input runs with a layer that it reads and a name", () => {
  const layers = [term(), coherence()];
  expect(check({ tool: "backscatter-state", layers, first: "hh-oct", second: null, title: " In decibels " })).toEqual({
    layers: [term()],
    faults: SOUND,
    inputs: { inputs: ["hh-oct"], title: "In decibels" },
  });
  expect(check({ tool: "coherence-state", layers, first: "coherence-80", second: null, title: "Coherence" })).toEqual({
    layers: [coherence()],
    faults: SOUND,
    inputs: { inputs: ["coherence-80"], title: "Coherence" },
  });
});

test("Backscatter, Change sends the layer of the earlier date first, whichever field holds it", () => {
  const layers = [laterTerm(), term()];
  const sent = { inputs: ["hh-oct", "hh-nov"], title: "Change" };
  expect(
    check({ tool: "backscatter-change", layers, first: "hh-oct", second: "hh-nov", title: "Change" }).inputs,
  ).toEqual(sent);
  expect(
    check({ tool: "backscatter-change", layers, first: "hh-nov", second: "hh-oct", title: "Change" }).inputs,
  ).toEqual(sent);
});

test("Soil moisture, One date runs with the layer of the soil moisture and a name", () => {
  const layers = [term(), soil(), soil({ id: "uncertainty", layer: "soilMoistureUncertainty" })];
  expect(check({ tool: "soil-moisture-state", layers, first: "soil-sep", second: null, title: "Moisture" })).toEqual({
    layers: [soil()],
    faults: SOUND,
    inputs: { inputs: ["soil-sep"], title: "Moisture" },
  });
  expect(
    check({ tool: "soil-moisture-state", layers, first: "uncertainty", second: null, title: "Moisture" }).faults.first,
  ).toBe("Choose a layer.");
});

test.each([
  ["soil-sep", "soil-oct"],
  ["soil-oct", "soil-sep"],
])("Soil moisture, Change sends the layer of the earlier date first (fields %s and %s)", (first, second) => {
  const layers = [laterSoil(), soil()];
  expect(check({ tool: "soil-moisture-change", layers, first, second, title: "Change" }).inputs).toEqual({
    inputs: ["soil-sep", "soil-oct"],
    title: "Change",
  });
});

test.each([
  ["pair-sep", "pair-oct"],
  ["pair-oct", "pair-sep"],
])("Coherence, Change sends the layer of the earlier pair first (fields %s and %s)", (first, second) => {
  const layers = [laterPair(), earlierPair(), coherence()];
  const checked = check({ tool: "coherence-change", layers, first, second, title: "Change" });
  expect(checked.faults).toEqual(SOUND);
  expect(checked.layers.map(({ id }) => id)).toEqual(["pair-sep", "pair-oct"]);
  expect(checked.inputs).toEqual({ inputs: ["pair-sep", "pair-oct"], title: "Change" });
});

test("the second field of Coherence, Change states what is missing or why the two pairs are not compared", () => {
  const choices = { tool: "coherence-change", title: "Name" } as const;
  const layers = [earlierPair(), laterPair(), longPair()];
  expect(check({ ...choices, layers, first: "pair-oct", second: null }).faults).toEqual({
    ...SOUND,
    second: "Choose the layer of the other pair.",
  });
  expect(check({ ...choices, layers, first: "pair-oct", second: "removed" }).faults.second).toBe(
    "Choose the layer of the other pair.",
  );
  const unequal = check({ ...choices, layers, first: "pair-oct", second: "pair-jul" });
  expect(unequal.faults).toEqual({ ...SOUND, second: spansSentence(24, 12) });
  expect(unequal.layers).toEqual([]);
  expect(unequal.inputs).toBeNull();
  const twice = check({
    ...choices,
    layers: [laterPair(), laterPair({ id: "again" })],
    first: "pair-oct",
    second: "again",
  });
  expect(twice.faults).toEqual({ ...SOUND, second: OVERLAP });
  expect(twice.inputs).toBeNull();
  // The 80 m layer of the same product does not stand beside the 20 m layer.
  const alone = check({ ...choices, layers: [laterPair(), coherence()], first: "pair-oct", second: "coherence-80" });
  expect(alone.faults).toEqual({ ...SOUND, second: NO_OTHER_PAIR });
  expect(NO_OTHER_PAIR).toBe("No other pair of dates of this layer is in the session.");
});

test("the second field of Soil moisture, Change states what is missing, as that of Backscatter, Change does", () => {
  const choices = { tool: "soil-moisture-change", title: "Name" } as const;
  expect(check({ ...choices, layers: [soil(), laterSoil()], first: "soil-sep", second: null }).faults.second).toBe(
    "Choose the layer of the other date.",
  );
  expect(
    check({ ...choices, layers: [soil(), soil({ id: "again" })], first: "soil-sep", second: "again" }).faults.second,
  ).toBe(SAME_DATE);
  const otherTrack = laterSoil({ id: "soil-104", inputs: [SME2_OCT.replace("_141_D_067_", "_104_A_067_")] });
  expect(check({ ...choices, layers: [soil(), otherTrack], first: "soil-sep", second: "soil-104" }).faults.second).toBe(
    NO_PARTNER,
  );
});

test("a missing layer is refused in one sentence", () => {
  const layers = [term(), laterTerm()];
  const none = check({ tool: "backscatter-state", layers, first: null, second: null, title: "Name" });
  expect(none.faults).toEqual({ ...SOUND, first: "Choose a layer." });
  expect(none.inputs).toBeNull();
  expect(check({ tool: "backscatter-change", layers, first: null, second: null, title: "Name" }).faults).toEqual({
    ...SOUND,
    first: "Choose a layer.",
  });
  expect(check({ tool: "backscatter-change", layers, first: "hh-oct", second: null, title: "Name" }).faults).toEqual({
    ...SOUND,
    second: "Choose the layer of the other date.",
  });
});

test("a layer that the tool does not read, or that has left the session, counts as missing", () => {
  const layers = [term(), coherence()];
  expect(
    check({ tool: "backscatter-state", layers, first: "coherence-80", second: null, title: "Name" }).faults.first,
  ).toBe("Choose a layer.");
  expect(check({ tool: "backscatter-state", layers, first: "removed", second: null, title: "Name" }).faults.first).toBe(
    "Choose a layer.",
  );
  expect(
    check({
      tool: "backscatter-change",
      layers: [term(), laterTerm()],
      first: "hh-oct",
      second: "removed",
      title: "Name",
    }).faults.second,
  ).toBe("Choose the layer of the other date.");
});

test("a first layer without a matching layer in the session is refused in one sentence", () => {
  const layers = [term(), laterTerm({ layer: "HVHV" })];
  const checked = check({ tool: "backscatter-change", layers, first: "hh-oct", second: "hh-nov", title: "Name" });
  expect(checked.faults).toEqual({ ...SOUND, second: NO_PARTNER });
  expect(NO_PARTNER).toBe("No other date of this layer is in the session.");
  expect(checked.inputs).toBeNull();
});

test("two layers of the same date are refused in one sentence", () => {
  const layers = [term(), term({ id: "again" })];
  const checked = check({ tool: "backscatter-change", layers, first: "hh-oct", second: "again", title: "Name" });
  expect(checked.faults).toEqual({
    ...SOUND,
    second: "Choose a layer of another date.",
  });
  expect(checked.layers).toEqual([]);
  expect(checked.inputs).toBeNull();
});

test("a name of the result that is empty or too long is refused in one sentence", () => {
  const layers = [term()];
  const choices = { tool: "backscatter-state", layers, first: "hh-oct", second: null } as const;
  expect(check({ ...choices, title: "   " }).faults).toEqual({ ...SOUND, title: "Give a name." });
  expect(check({ ...choices, title: "a".repeat(MOST_TITLE) }).faults).toEqual(SOUND);
  const long = check({ ...choices, title: "a".repeat(MOST_TITLE + 1) });
  expect(long.faults).toEqual({
    ...SOUND,
    title: "The name is longer than 200 characters.",
  });
  expect(long.inputs).toBeNull();
});

test("the foot of the form states the first fault in the order of the fields", () => {
  expect(missingOf(SOUND)).toBeNull();
  expect(missingOf({ first: "One.", second: "Two.", title: "Three." })).toBe("One.");
  expect(missingOf({ first: null, second: "Two.", title: "Three." })).toBe("Two.");
  expect(missingOf({ first: null, second: null, title: "Three." })).toBe("Three.");
});

test("each tool reads the product type, the number of layers and the number of dates of its method sheet", () => {
  expect(
    Object.fromEntries(
      FINISHED_TOOLS.map((tool) => [tool, [READS[tool].product, READS[tool].count, READS[tool].dates]]),
    ),
  ).toEqual({
    "backscatter-state": ["GCOV", 1, 1],
    "backscatter-change": ["GCOV", 2, 1],
    "coherence-state": ["GUNW", 1, 2],
    "coherence-change": ["GUNW", 2, 2],
    "soil-moisture-state": ["SME2", 1, 1],
    "soil-moisture-change": ["SME2", 2, 1],
  });
  expect(FINISHED_TOOLS.map((tool) => READS[tool].unit)).toEqual(["1", "1", "1", "1", "m3 m-3", "m3 m-3"]);
});
