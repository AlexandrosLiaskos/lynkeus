// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import {
  citationText,
  COLLECTION_TITLES,
  dataCitation,
  dataSources,
  LYNKEUS,
  softwareCitation,
  sourceOf,
} from "./citation";
import { asLayerRecord, type LayerRecord } from "./record";
import first from "./testdata/record-gcov-20261021.json";
import second from "./testdata/record-gcov-20261102.json";
import result from "./testdata/record-result.json";

// The pattern of a DOI in the schema of the Scientific Citation extension of STAC, version 1.0.0.
const DOI = /^10\.[0-9a-zA-Z]{4,}\/[^\s]+$/;

const SITE = window.location.origin;
const RECORDS: Readonly<Record<string, unknown>> = {
  [`${SITE}/files/backscatter-change/backscatter-change.json`]: result,
  [`${SITE}/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json`]: first,
  [`${SITE}/files/gcov-hhhh-20261102/gcov-hhhh-20261102.json`]: second,
};

function record(value: unknown): LayerRecord {
  const read = asLayerRecord(value);
  if (!read) {
    throw new Error("The test record is not a STAC Item.");
  }
  return read;
}

const read = vi.fn((address: string) => Promise.resolve(record(RECORDS[address])));

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
  inputs: ["first.h5", "second.h5"],
  program: "Lynkeus 0.1.0",
  method: "Method sheet of the tool.",
  record: "/files/backscatter-change/backscatter-change.json",
};

test("the seven collections have a DOI of the form that the extension asks for", () => {
  expect(Object.keys(COLLECTION_TITLES)).toHaveLength(7);
  for (const doi of Object.keys(COLLECTION_TITLES)) {
    expect(doi).toMatch(DOI);
  }
  // The catalogue of NASA gives the provisional interferograms the DOI 10.5067/NIL1GUNW-P1, which doi.org does not
  // resolve. The list holds the DOI that the products carry and that doi.org resolves.
  expect(COLLECTION_TITLES["10.5067/NIL2GUNW-P1"]).toBe(
    "NISAR Provisional Geocoded Unwrapped Interferogram Product (Version 1)",
  );
  expect(COLLECTION_TITLES["10.5067/NIL1GUNW-P1"]).toBeUndefined();
});

test("the test records name the extension and carry a DOI of a collection that Lynkeus reads", () => {
  for (const item of [first, second]) {
    expect(item.stac_extensions).toContain("https://stac-extensions.github.io/scientific/v1.0.0/schema.json");
    expect(item.properties["sci:doi"]).toMatch(DOI);
    expect(COLLECTION_TITLES[item.properties["sci:doi"]]).toBeDefined();
  }
});

test("the record of a received layer names its dataset and the day on which the data were received", () => {
  expect(sourceOf(record(first))).toEqual({ doi: "10.5067/NIL2GCOV-V1", citation: null, accessed: "2026-11-14" });
});

test("a record without a DOI, or with a text that is not a DOI, names no dataset", () => {
  expect(sourceOf(record(result))).toBeNull();
  expect(
    sourceOf(record({ type: "Feature", id: "a", properties: { "sci:doi": "doi:10.5067/NIL2GCOV-V1" } })),
  ).toBeNull();
  expect(sourceOf(record({ type: "Feature", id: "a", properties: { "sci:doi": 10.5067 } }))).toBeNull();
});

test("the citation that a record gives is kept, without the spaces around it", () => {
  const given = record({
    type: "Feature",
    id: "a",
    properties: { "sci:doi": "10.5067/NIL2GCOV-P1", "sci:citation": " As given. " },
  });
  expect(sourceOf(given)).toEqual({ doi: "10.5067/NIL2GCOV-P1", citation: "As given.", accessed: null });
});

test("the datasets of a result are read from the records of its inputs, each dataset once", async () => {
  read.mockClear();
  const sources = await dataSources("/files/backscatter-change/backscatter-change.json", read);
  expect(sources).toEqual([{ doi: "10.5067/NIL2GCOV-V1", citation: null, accessed: "2026-11-14" }]);
  expect(read.mock.calls.map(([address]) => address)).toEqual([
    `${SITE}/files/backscatter-change/backscatter-change.json`,
    `${SITE}/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json`,
    `${SITE}/files/gcov-hhhh-20261102/gcov-hhhh-20261102.json`,
  ]);
});

test("the dataset of a received layer is read from its own record", async () => {
  read.mockClear();
  expect(await dataSources("/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json", read)).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(1);
});

test("a record of another site is not read, and records that link to each other are read once", async () => {
  const loop = vi.fn((address: string) =>
    Promise.resolve(
      record({
        type: "Feature",
        id: address,
        properties: {},
        links: [
          { rel: "derived_from", href: "/files/a.json" },
          { rel: "derived_from", href: "/files/b.json" },
          { rel: "derived_from", href: "https://example.org/c.json" },
          { rel: "via", href: "/files/d.json" },
        ],
      }),
    ),
  );
  expect(await dataSources("/files/a.json", loop)).toEqual([]);
  expect(loop.mock.calls.map(([address]) => address)).toEqual([`${SITE}/files/a.json`, `${SITE}/files/b.json`]);
});

test("a dataset is cited in the form of the catalogue of NASA, with the day on which the data were received", () => {
  expect(dataCitation({ doi: "10.5067/NIL2GCOV-V1", citation: null, accessed: "2026-11-14" })).toBe(
    "NASA/JPL/NISAR. NISAR Validated Geocoded Polarimetric Covariance Product (Version 1) [Dataset]. " +
      "NASA Alaska Satellite Facility Distributed Active Archive Center. https://doi.org/10.5067/NIL2GCOV-V1 " +
      "Date accessed: 2026-11-14.",
  );
});

test("a citation that the record gives is used word for word, and an unknown DOI is given as its address", () => {
  expect(dataCitation({ doi: "10.5067/NIL2GCOV-V1", citation: "As given.", accessed: null })).toBe("As given.");
  expect(dataCitation({ doi: "10.1234/other", citation: null, accessed: null })).toBe("https://doi.org/10.1234/other");
});

test("Lynkeus is cited with the values of the file CITATION.cff", () => {
  // The tests run in the folder of the interface; the file stands in the folder above it.
  const citationFile = readFileSync("../CITATION.cff", "utf8");
  expect(citationFile).toContain(`title: ${LYNKEUS.title}\n`);
  expect(citationFile).toContain(`version: ${LYNKEUS.version}\n`);
  expect(citationFile).toContain(`repository-code: "${LYNKEUS.address}"\n`);
  expect(citationFile).toContain("family-names: Liaskos\n");
  expect(citationFile).toContain("given-names: Alexandros\n");
  expect(citationFile).toContain('  - name: "Team Lynkeus"\n');
  expect(softwareCitation()).toBe(
    `Liaskos, A., and Team Lynkeus. Lynkeus (Version ${LYNKEUS.version}) [Computer software]. https://github.com/AlexandrosLiaskos/lynkeus`,
  );
});

test("the citation of a result names its data, its product files, its method and Lynkeus", () => {
  const text = citationText(LAYER, [{ doi: "10.5067/NIL2GCOV-V1", citation: null, accessed: "2026-11-14" }]);
  expect(text.split("\n\n")).toEqual([
    "Data\nNASA/JPL/NISAR. NISAR Validated Geocoded Polarimetric Covariance Product (Version 1) [Dataset]. " +
      "NASA Alaska Satellite Facility Distributed Active Archive Center. https://doi.org/10.5067/NIL2GCOV-V1 " +
      "Date accessed: 2026-11-14.\nProduct files: first.h5, second.h5.",
    "Method\nMethod sheet of the tool.",
    `Software\n${softwareCitation()}`,
  ]);
});

test("the citation of a received layer has no method", () => {
  const text = citationText({ ...LAYER, kind: "layer", method: null }, []);
  expect(text.split("\n\n").map((part) => part.split("\n")[0])).toEqual(["Data", "Software"]);
});
