import { expect, test } from "vitest";
import { SOURCES as ANALYSIS_SOURCES } from "../analysis/sources";
import { SOURCES as DATA_SOURCES } from "../data/sources";
import { SOURCES as MAP_SOURCES } from "../map/sources";
import { SOURCES as STATUS_BAR_SOURCES } from "../statusbar/sources";
import { SOURCE_PARTS, sourceFaults, type SourcePart } from "./sources";

const SOUND: readonly SourcePart[] = [
  {
    name: "First",
    sources: [
      { name: "Program", version: "1.2.3", licence: "MIT", url: "https://example.org/program", use: "Draws" },
      { name: "Dataset", licence: "CC0-1.0", url: "https://example.org/dataset", use: "Is drawn" },
    ],
  },
  {
    name: "Second",
    sources: [{ name: "Method", licence: "CC-BY-4.0", url: "http://example.org/method", use: "Counts" }],
  },
  { name: "Third", sources: [] },
];

test("the lists of the three parts are joined under the names of the parts, in the order of CONTRIBUTING.md", () => {
  expect(SOURCE_PARTS.map(({ name }) => name)).toEqual(["Map", "Data", "Analysis"]);
});

test("each part shows what its lists hold, and the Map part the list of the map and the list of the status bar", () => {
  expect(SOURCE_PARTS.map(({ sources }) => sources)).toEqual([
    [...MAP_SOURCES, ...STATUS_BAR_SOURCES],
    DATA_SOURCES,
    ANALYSIS_SOURCES,
  ]);
});

test("sound lists have no fault, with or without a version and with an empty part", () => {
  expect(sourceFaults(SOUND)).toEqual([]);
});

test("an entry without a name, a licence, a use or an address of the web is named", () => {
  const sources = [
    { name: " ", licence: "MIT", url: "https://example.org/", use: "Draws" },
    { name: "No licence", licence: "", url: "https://example.org/", use: "Draws" },
    { name: "No use", licence: "MIT", url: "https://example.org/", use: "  " },
    { name: "No address", licence: "MIT", url: "", use: "Draws" },
    { name: "Not of the web", licence: "MIT", url: "ftp://example.org/", use: "Draws" },
    { name: "Not an address", licence: "MIT", url: "example.org", use: "Draws" },
    { name: "Empty version", version: "", licence: "MIT", url: "https://example.org/", use: "Draws" },
  ];
  expect(sourceFaults([{ name: "Part", sources }])).toEqual([
    "Part, entry 1 has no name.",
    "Part, entry 2 (No licence) has no licence.",
    "Part, entry 3 (No use) has no use.",
    "Part, entry 4 (No address) has no address of the web.",
    "Part, entry 5 (Not of the web) has no address of the web.",
    "Part, entry 6 (Not an address) has no address of the web.",
    "Part, entry 7 (Empty version) has an empty version.",
  ]);
});

test("a name that appears twice is named, in one list or across two, whatever its capital letters", () => {
  const source = { licence: "MIT", url: "https://example.org/", use: "Draws" };
  const parts = [
    {
      name: "First",
      sources: [
        { ...source, name: "Program" },
        { ...source, name: "Program" },
      ],
    },
    {
      name: "Second",
      sources: [
        { ...source, name: "Other" },
        { ...source, name: "PROGRAM " },
      ],
    },
  ];
  expect(sourceFaults(parts)).toEqual([
    "First, entry 2 (Program) has the name of First, entry 1.",
    "Second, entry 2 (PROGRAM) has the name of First, entry 1.",
  ]);
});

test("every entry of the three lists has the fields that a source needs, and no name appears twice", () => {
  expect(sourceFaults(SOURCE_PARTS)).toEqual([]);
});
