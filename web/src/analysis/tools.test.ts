import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { coherence, GCOV_NOV, GCOV_OCT, GUNW_PAIR, laterTerm, term } from "./testLayers";
import {
  accepted,
  acquisitionOf,
  acquisitionWords,
  BACKSCATTER_TERMS,
  check,
  defaultTitle,
  FINISHED_TOOLS,
  inOrder,
  layerOption,
  matches,
  missingOf,
  MOST_TITLE,
  NO_PARTNER,
  partners,
  READS,
  unfit,
  unnamed,
} from "./tools";

test("the finished tools are the three tools of level 1, under the names of their buttons", () => {
  expect(FINISHED_TOOLS).toEqual(["backscatter-state", "backscatter-change", "coherence-state"]);
});

test("the acquisition is read from the names of the product files of the pilot area", () => {
  expect(acquisitionOf(GCOV_OCT)).toEqual({ instrument: "L", product: "GCOV", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(GCOV_NOV)).toEqual({ instrument: "L", product: "GCOV", track: 141, direction: "D", frame: 67 });
  expect(acquisitionOf(GUNW_PAIR)).toEqual({ instrument: "L", product: "GUNW", track: 141, direction: "D", frame: 67 });
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
  expect(partners(term(), layers).map(({ id }) => id)).toEqual(["hh-nov"]);
  expect(partners(term(), [term()])).toEqual([]);
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
});

test("no name is proposed while an input layer is missing", () => {
  expect(defaultTitle("backscatter-state", [])).toBe("");
  expect(defaultTitle("backscatter-change", [term()])).toBe("");
  expect(defaultTitle("coherence-state", [])).toBe("");
});

test("every proposed name is a name that the server takes", () => {
  for (const title of [
    defaultTitle("backscatter-state", [term()]),
    defaultTitle("backscatter-change", [term(), laterTerm()]),
    defaultTitle("coherence-state", [coherence()]),
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

test("a missing layer is refused in one sentence", () => {
  const layers = [term(), laterTerm()];
  const none = check({ tool: "backscatter-state", layers, first: null, second: null, title: "Name" });
  expect(none.faults).toEqual({ ...SOUND, first: "Choose the input layer." });
  expect(none.inputs).toBeNull();
  expect(check({ tool: "backscatter-change", layers, first: null, second: null, title: "Name" }).faults).toEqual({
    ...SOUND,
    first: "Choose the first layer.",
  });
  expect(check({ tool: "backscatter-change", layers, first: "hh-oct", second: null, title: "Name" }).faults).toEqual({
    ...SOUND,
    second: "Choose the second layer.",
  });
});

test("a layer that the tool does not read, or that has left the session, counts as missing", () => {
  const layers = [term(), coherence()];
  expect(
    check({ tool: "backscatter-state", layers, first: "coherence-80", second: null, title: "Name" }).faults.first,
  ).toBe("Choose the input layer.");
  expect(check({ tool: "backscatter-state", layers, first: "removed", second: null, title: "Name" }).faults.first).toBe(
    "Choose the input layer.",
  );
  expect(
    check({
      tool: "backscatter-change",
      layers: [term(), laterTerm()],
      first: "hh-oct",
      second: "removed",
      title: "Name",
    }).faults.second,
  ).toBe("Choose the second layer.");
});

test("a first layer without a matching layer in the session is refused in one sentence", () => {
  const layers = [term(), laterTerm({ layer: "HVHV" })];
  const checked = check({ tool: "backscatter-change", layers, first: "hh-oct", second: "hh-nov", title: "Name" });
  expect(checked.faults).toEqual({ ...SOUND, second: NO_PARTNER });
  expect(NO_PARTNER).toBe("No other layer of the session matches the first layer.");
  expect(checked.inputs).toBeNull();
});

test("two layers of the same date are refused in one sentence", () => {
  const layers = [term(), term({ id: "again" })];
  const checked = check({ tool: "backscatter-change", layers, first: "hh-oct", second: "again", title: "Name" });
  expect(checked.faults).toEqual({
    ...SOUND,
    second: "The two layers have the same date. Choose a layer of another date.",
  });
  expect(checked.layers).toEqual([]);
  expect(checked.inputs).toBeNull();
});

test("a name of the result that is empty or too long is refused in one sentence", () => {
  const layers = [term()];
  const choices = { tool: "backscatter-state", layers, first: "hh-oct", second: null } as const;
  expect(check({ ...choices, title: "   " }).faults).toEqual({ ...SOUND, title: "Give the name of the result." });
  expect(check({ ...choices, title: "a".repeat(MOST_TITLE) }).faults).toEqual(SOUND);
  const long = check({ ...choices, title: "a".repeat(MOST_TITLE + 1) });
  expect(long.faults).toEqual({
    ...SOUND,
    title: "The name of the result has 201 characters, and at most 200 are accepted.",
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
  });
});
