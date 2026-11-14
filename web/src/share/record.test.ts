import { afterEach, expect, test, vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { asLayerRecord, provenanceText, readRecord, recordText, siteAddress } from "./record";
import received from "./testdata/record-gcov-20261021.json";
import result from "./testdata/record-result.json";

// Records in the form that the server writes, for the sample files of the lower Merrimack River.
const PAGE = "https://lynkeus.nkua.cloud/";

const LAYER: LayerDescription = {
  id: "backscatter-change",
  title: "Change of backscatter HH",
  kind: "result",
  url: "/files/backscatter-change/backscatter-change.tif",
  quantity: "Change of radar backscatter gamma nought, HH",
  unit: "dB",
  range: [-6, 6],
  colours: "RdBu",
  dates: ["2026-10-21", "2026-11-02"],
  inputs: [
    "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5",
    "NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001.h5",
  ],
  program: "Lynkeus 0.1.0",
  method: "Method sheet of the tool.",
  record: "/files/backscatter-change/backscatter-change.json",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a STAC Item is read as its id, its properties and its links", () => {
  const record = asLayerRecord(received);
  expect(record?.id).toBe("gcov-hhhh-20261021");
  expect(record?.properties["sci:doi"]).toBe("10.5067/NIL2GCOV-V1");
  expect(record?.links).toEqual([
    { rel: "via", href: "https://cmr.earthdata.nasa.gov/search/concepts/G4405194348-ASF.umm_json" },
  ]);
  expect(record?.whole).toBe(received);
});

test.each([
  ["null", null],
  ["a list", []],
  ["a feature collection", { type: "FeatureCollection", features: [] }],
  ["a feature without an id", { type: "Feature", properties: {} }],
  ["a feature without properties", { type: "Feature", id: "a", properties: null }],
])("%s is not a record of a layer", (_name, value) => {
  expect(asLayerRecord(value)).toBeNull();
});

test("a link that is not an object with a relation and an address is left out", () => {
  const record = asLayerRecord({
    type: "Feature",
    id: "a",
    properties: {},
    links: [null, { rel: "via" }, { rel: "via", href: "/x" }],
  });
  expect(record?.links).toEqual([{ rel: "via", href: "/x" }]);
});

test("an address of the site is completed, and an address of another site is refused", () => {
  expect(siteAddress("/files/a/b.json", PAGE)).toBe("https://lynkeus.nkua.cloud/files/a/b.json");
  expect(siteAddress("https://lynkeus.nkua.cloud/files/a/b.json", PAGE)).toBe(
    "https://lynkeus.nkua.cloud/files/a/b.json",
  );
  expect(siteAddress("https://example.org/files/a/b.json", PAGE)).toBeNull();
  expect(siteAddress("//example.org/b.json", PAGE)).toBeNull();
  expect(siteAddress("http://lynkeus.nkua.cloud/files/a/b.json", PAGE)).toBeNull();
});

test("a record is read from the site, and a failure is told in words", async () => {
  const fetched = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) });
  vi.stubGlobal("fetch", fetched);
  const record = await readRecord("/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json");
  expect(record.id).toBe("gcov-hhhh-20261021");
  expect(fetched).toHaveBeenCalledWith(
    new URL("/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json", window.location.href).href,
  );

  await expect(readRecord("https://example.org/record.json")).rejects.toThrow("not on this site");
  expect(fetched).toHaveBeenCalledTimes(1);
  fetched.mockResolvedValueOnce({ ok: false, status: 404 });
  await expect(readRecord("/files/a/b.json")).rejects.toThrow("answer 404");
  fetched.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ type: "FeatureCollection" }) });
  await expect(readRecord("/files/a/b.json")).rejects.toThrow("not a STAC Item");
});

test("the saved record names the saved data file and gives the links of the site as full addresses", () => {
  const record = asLayerRecord(result);
  if (!record) {
    throw new Error("The test record is not a STAC Item.");
  }
  const text = recordText(record, "change-of-backscatter-hh-20261021-20261102.tif", PAGE);
  expect(text.endsWith("}\n")).toBe(true);
  const saved = JSON.parse(text) as typeof result;
  expect(saved.assets.data.href).toBe("./change-of-backscatter-hh-20261021-20261102.tif");
  expect(saved.links.map(({ href }) => href)).toEqual([
    "https://lynkeus.nkua.cloud/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json",
    "https://lynkeus.nkua.cloud/files/gcov-hhhh-20261102/gcov-hhhh-20261102.json",
  ]);
  // Everything else is as the server wrote it.
  expect({ ...saved, links: result.links, assets: result.assets }).toEqual(result);
  expect({ ...saved.assets.data, href: result.assets.data.href }).toEqual(result.assets.data);
  // The record that was read is not changed.
  expect(result.assets.data.href).toBe("./backscatter-change.tif");
});

test("a link to another site stays as it is in the saved record", () => {
  const record = asLayerRecord(received);
  if (!record) {
    throw new Error("The test record is not a STAC Item.");
  }
  const saved = JSON.parse(recordText(record, "backscatter-hh-20261021.tif", PAGE)) as typeof received;
  expect(saved.links[0]?.href).toBe("https://cmr.earthdata.nasa.gov/search/concepts/G4405194348-ASF.umm_json");
});

test("the provenance record of a result states its inputs, its program, its method and how it was made", () => {
  expect(provenanceText(LAYER, asLayerRecord(result), PAGE)).toBe(
    [
      "Provenance record",
      "",
      "Title: Change of backscatter HH",
      "Kind: result of an analysis tool",
      "Quantity: Change of radar backscatter gamma nought, HH",
      "Unit: dB",
      "Dates of the data: 2026-10-21, 2026-11-02",
      "Input files:",
      "  NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5",
      "  NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001.h5",
      "Program: Lynkeus 0.1.0",
      "Method: Method sheet of the tool.",
      "Lineage: Result of the analysis tool backscatter-change of Lynkeus 0.1.0 on the layers: Backscatter HH, 21 Oct 2026, Backscatter HH, 2 Nov 2026. Method: Method sheet of the tool.",
      "Processed: 2026-11-14T16:10:00Z",
      "Software: Lynkeus 0.1.0, GDAL 3.11.4",
      "File: https://lynkeus.nkua.cloud/files/backscatter-change/backscatter-change.tif",
      "Record: https://lynkeus.nkua.cloud/files/backscatter-change/backscatter-change.json",
      "",
    ].join("\n"),
  );
});

test("the provenance record of a received layer has no method, and without its record no lineage", () => {
  const text = provenanceText({ ...LAYER, kind: "layer", method: null }, null, PAGE);
  expect(text).toContain("Kind: layer received from NASA");
  expect(text).not.toContain("Method:");
  expect(text).not.toContain("Lineage:");
  expect(text).not.toContain("Software:");
  expect(text).toContain("Program: Lynkeus 0.1.0");
});
