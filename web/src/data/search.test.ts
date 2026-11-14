import { afterEach, expect, test, vi } from "vitest";
import product from "../../../api/tests/data/product-gcov.json";
import {
  describeSearch,
  findProducts,
  firstDraft,
  namesOf,
  searchAddress,
  searchOfDraft,
  type ProductSearch,
  type SearchDraft,
} from "./search";

const TODAY = new Date("2026-11-14T12:00:00Z");
const BOX = { kind: "rectangle", west: "-71.2", south: "42.6", east: "-70.75", north: "42.95" } as const;
const DRAFT: SearchDraft = firstDraft(BOX, TODAY);

function search(changes: Partial<SearchDraft>): ProductSearch {
  const made = searchOfDraft({ ...DRAFT, ...changes });
  if (typeof made === "string") {
    throw new Error(made);
  }
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the form starts with backscatter products of the last 30 days in the given area", () => {
  expect(DRAFT).toMatchObject({
    by: "properties",
    product: "GCOV",
    maturity: ["Validated", "Provisional"],
    limited: true,
    area: BOX,
    period: "30-days",
    start: "2026-10-15",
    end: "2026-11-14",
  });
  expect(search({})).toEqual({
    product: "GCOV",
    maturity: ["Validated", "Provisional"],
    area: { kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
    start: "2026-10-15",
    end: "2026-11-14",
    season: null,
    pairInside: false,
    track: null,
    frame: null,
    orbit: null,
    direction: null,
    channels: [],
    sideChannels: [],
    bands: [],
    bandwidth: null,
    coverage: null,
    joint: null,
    cycle: null,
    names: [],
    sort: "newest",
  });
});

test.each<[string, Partial<SearchDraft>, RegExp]>([
  ["no level of validation", { maturity: [] }, /at least one level of validation/],
  ["an empty side of the area", { area: { ...BOX, west: " " } }, /four sides of the area as numbers/],
  ["a side that is no number", { area: { ...BOX, north: "north" } }, /four sides of the area as numbers/],
  ["a latitude past the pole", { area: { ...BOX, north: "91" } }, /The area is not valid/],
  ["a south above the north", { area: { ...BOX, south: "43" } }, /South must be smaller than north/],
  ["a missing day", { end: "" }, /first and the last day/],
  ["a period that ends before it starts", { start: "2026-11-15" }, /after the last/],
  [
    "a day that its month does not have",
    { season: { start: { month: 2, day: 30 }, end: { month: 3, day: 1 } } },
    /does not exist/,
  ],
  ["a track past the last", { track: "174" }, /track as a number from 1 to 173/],
  ["a track range that runs backwards", { track: "15-12" }, /track as a number/],
  ["a frame that is no number", { frame: "abc" }, /frame as a number from 1 to 176/],
  ["an orbit of zero", { orbit: "0" }, /orbit as a whole number/],
  ["a range of cycles", { cycle: "32-33" }, /cycle as one whole number/],
])("the form refuses %s", (_reason, changes, words) => {
  expect(searchOfDraft({ ...DRAFT, ...changes })).toMatch(words);
});

test("every choice of the form enters the search", () => {
  const made = search({
    product: "GCOV",
    maturity: ["Validated", "Beta"],
    period: "custom",
    start: "2026-01-01",
    season: { start: { month: 12, day: 1 }, end: { month: 2, day: 28 } },
    track: " 141 ",
    frame: "60 - 70",
    orbit: "6460-6468",
    cycle: "33",
    direction: "descending",
    channels: ["HH", "HV"],
    sideChannels: ["VV"],
    bands: ["A", "B"],
    bandwidth: 40,
    coverage: "full",
    joint: "no",
  });
  expect(made).toMatchObject({
    maturity: ["Validated", "Beta"],
    start: "2026-01-01",
    end: "2026-11-14",
    season: [335, 59],
    track: [141, 141],
    frame: [60, 70],
    orbit: [6460, 6468],
    cycle: 33,
    direction: "descending",
    channels: ["HH", "HV"],
    sideChannels: ["VV"],
    bands: ["A", "B"],
    bandwidth: 40,
    coverage: "full",
    joint: false,
  });
  expect(searchOfDraft({ ...DRAFT, joint: "yes" }, "largest")).toMatchObject({ joint: true, sort: "largest" });
});

test("a choice that the product type does not have is left out of the search", () => {
  const choices = { sideChannels: ["VV"], bands: ["B"], bandwidth: 40, pairInside: true } as const;
  expect(search({ ...choices, product: "GUNW" })).toMatchObject({
    sideChannels: [],
    bands: [],
    bandwidth: 40,
    pairInside: true,
  });
  expect(search({ ...choices, product: "SME2" })).toMatchObject({
    sideChannels: ["VV"],
    bands: ["B"],
    bandwidth: null,
    pairInside: false,
  });
});

test("a search of the whole Earth has no area, and polygons are taken as they are", () => {
  expect(search({ limited: false }).area).toBeNull();
  const rings = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ] as const;
  expect(search({ area: { kind: "polygons", rings } }).area).toEqual({ kind: "polygons", rings });
  expect(searchOfDraft({ ...DRAFT, area: { kind: "polygons", rings: [] } })).toMatch(/at least three points/);
});

test("product names are read from lines and commas, without the ending of the file", () => {
  expect(namesOf(" NISAR_L2_PR_GCOV_033_*,\nNISAR_A.h5 ; NISAR_A\n\n")).toEqual(["NISAR_L2_PR_GCOV_033_*", "NISAR_A"]);
  const made = search({ by: "names", names: "NISAR_L2_PR_GCOV_033_*\nNISAR_L3_PR_SME2_032_141_D_067_*", track: "141" });
  expect(made).toMatchObject({
    product: null,
    names: ["NISAR_L2_PR_GCOV_033_*", "NISAR_L3_PR_SME2_032_141_D_067_*"],
    area: null,
    start: null,
    end: null,
    track: null,
  });
});

test("wrong product names are refused", () => {
  expect(searchOfDraft({ ...DRAFT, by: "names", names: "  " })).toMatch(/at least one product name/);
  expect(searchOfDraft({ ...DRAFT, by: "names", names: "NISAR_(1)" })).toMatch(/"NISAR_\(1\)" is not a product name/);
  const many = Array.from({ length: 51 }, (_, index) => `NISAR_${String(index)}`).join("\n");
  expect(searchOfDraft({ ...DRAFT, by: "names", names: many })).toMatch(/at most 50 product names, and 51 were given/);
});

test("the address of a search of an area and a period carries only what was chosen", () => {
  expect(searchAddress(search({ start: "2026-10-01" }))).toBe(
    "/api/products?product=GCOV&maturity=Validated&maturity=Provisional&west=-71.2&south=42.6&east=-70.75&north=42.95&start=2026-10-01&end=2026-11-14",
  );
});

test("the address of a search carries every choice", () => {
  const made = search({
    product: "GUNW",
    maturity: ["Beta"],
    area: {
      kind: "polygons",
      rings: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        [
          [170, 10],
          [-170, 10],
          [-170, 20],
          [170, 10],
        ],
      ],
    },
    start: "2026-01-01",
    season: { start: { month: 6, day: 1 }, end: { month: 8, day: 31 } },
    pairInside: true,
    track: "141",
    frame: "60-70",
    orbit: "6000-6468",
    cycle: "32",
    direction: "ascending",
    channels: ["HH", "VV"],
    bandwidth: 77,
    coverage: "partial",
    joint: "yes",
  });
  const address = searchAddress({ ...made, sort: "oldest" }, 400);
  expect(decodeURIComponent(address)).toBe(
    "/api/products?product=GUNW&maturity=Beta&polygon=0,0,1,0,1,1,0,0&polygon=170,10,-170,10,-170,20,170,10" +
      "&start=2026-01-01&end=2026-11-14&season_start=152&season_end=243&pair=inside&track=141&frame=60-70" +
      "&orbit=6000-6468&direction=ascending&channel=HH&channel=VV&bandwidth=77&coverage=partial&joint=true" +
      "&cycle=32&sort=oldest&offset=400",
  );
});

test("the address of a search by names carries the names and no product type", () => {
  const made = search({ by: "names", names: "NISAR_L2_PR_GCOV_033_*, NISAR_?" });
  expect(decodeURIComponent(searchAddress(made))).toBe(
    "/api/products?maturity=Validated&maturity=Provisional&name=NISAR_L2_PR_GCOV_033_*&name=NISAR_?",
  );
});

test("the products of the server are returned", async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ found: 1, products: [product] }))));
  vi.stubGlobal("fetch", fetch);
  const made = search({});
  const answer = await findProducts(made, 200);
  expect(answer.found).toBe(1);
  expect(answer.products[0]?.id).toBe("G4405194348-ASF");
  expect(fetch).toHaveBeenCalledWith(
    searchAddress(made, 200),
    expect.objectContaining({ headers: { Accept: "application/json" } }),
  );
});

test("a search is stated in words", () => {
  expect(describeSearch(search({ start: "2026-10-01" }))).toEqual([
    "GCOV (Geocoded Polarimetric Covariance), validated and provisional, in the rectangle from 71.2° W to 70.75° W and from 42.6° N to 42.95° N, from 1 Oct 2026 to 14 Nov 2026.",
  ]);
  const full = search({
    product: "GUNW",
    maturity: ["Validated", "Provisional", "Beta"],
    limited: false,
    season: { start: { month: 6, day: 1 }, end: { month: 8, day: 31 } },
    pairInside: true,
    track: "141",
    frame: "60-70",
    orbit: "6468",
    cycle: "32",
    direction: "descending",
    channels: ["HH", "VV"],
    bandwidth: 40,
    coverage: "full",
    joint: "no",
  });
  expect(describeSearch({ ...full, sort: "name" })).toEqual([
    "GUNW (Geocoded Unwrapped Interferogram), validated, provisional and beta, over the whole Earth, from 15 Oct 2026 to 14 Nov 2026.",
    "Only from 1 June to 31 August of each year.",
    "Both acquisitions of a pair lie inside the period.",
    "Limited to: track 141; frame 60-70; descending; cycle 32; orbit 6468; HH and VV in band A; bandwidth 40 MHz; full frame; not observed with the S-band radar.",
  ]);
  expect(describeSearch(search({ by: "names", names: "NISAR_L2_PR_GCOV_033_*" }))).toEqual([
    "Products of every type (validated and provisional) that match 1 product name: NISAR_L2_PR_GCOV_033_*.",
  ]);
});
