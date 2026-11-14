import { afterEach, expect, test } from "vitest";
import { creditParts, creditsOf } from "../shared/credits/credits";
import { imageryStore } from "./imagery";
import { createMap, showBaseMap } from "./map";

const first = imageryStore.get();

afterEach(() => {
  imageryStore.set(first);
});

test("the credit of the Blue Marble stands beside the map and links to NASA GIBS", () => {
  const map = createMap();
  showBaseMap(map, "blue-marble");
  const credits = creditsOf(map);
  expect(credits.map(({ place }) => place)).toEqual(["beside"]);
  expect(creditParts(credits[0]?.html ?? "")).toEqual([
    "Imagery: ",
    { text: "NASA GIBS", address: "https://nasa-gibs.github.io/gibs-api-docs/" },
  ]);
});

test("the credit of OpenStreetMap stands on the map itself and links to the page of its licence", () => {
  const map = createMap();
  showBaseMap(map, "openstreetmap");
  const credits = creditsOf(map);
  expect(credits.map(({ place }) => place)).toEqual(["map"]);
  expect(creditParts(credits[0]?.html ?? "")).toEqual([
    "\u00a9 ",
    { text: "OpenStreetMap", address: "https://www.openstreetmap.org/copyright" },
    " contributors.",
  ]);
});

test("the credit of the imagery of a date names the day and the instrument, and stands beside the map", () => {
  const map = createMap();
  showBaseMap(map, "imagery");
  imageryStore.set({ layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", date: "2026-11-02" });
  const credits = creditsOf(map);
  expect(credits.map(({ place }) => place)).toEqual(["beside"]);
  expect(creditParts(credits[0]?.html ?? "")).toEqual([
    "Image of 2026-11-02 (VIIRS, NOAA-20): ",
    { text: "NASA GIBS", address: "https://nasa-gibs.github.io/gibs-api-docs/" },
  ]);
});
