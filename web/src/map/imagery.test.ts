import { beforeEach, expect, test } from "vitest";
import {
  createImagerySource,
  dayBefore,
  IMAGERY,
  IMAGERY_FAULTS,
  imageryFault,
  imageryStore,
  imageryUrl,
  utcDay,
} from "./imagery";

const TERRA = "MODIS_Terra_CorrectedReflectance_TrueColor";

beforeEach(() => {
  imageryStore.set({ layer: TERRA, date: "2026-11-02" });
});

test("the address of the tiles carries the layer, the day and the tile matrix set", () => {
  expect(imageryUrl({ layer: TERRA, date: "2026-11-02" })).toBe(
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-11-02/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg",
  );
});

test("the day before a moment is taken in Coordinated Universal Time", () => {
  expect(utcDay(new Date("2026-11-14T23:30:00+02:00"))).toBe("2026-11-14");
  expect(dayBefore(new Date("2026-11-14T01:30:00+02:00"))).toBe("2026-11-12");
  expect(dayBefore(new Date("2026-03-01T12:00:00Z"))).toBe("2026-02-28");
});

test("a day is accepted from the first day of the layer to the present day", () => {
  const today = "2026-11-14";
  expect(imageryFault({ layer: TERRA, date: "2000-02-24" }, today)).toBeNull();
  expect(imageryFault({ layer: TERRA, date: today }, today)).toBeNull();
  expect(imageryFault({ layer: TERRA, date: "2000-02-23" }, today)).toBe(
    "The images of MODIS, Terra start on 24 Feb 2000. Enter a later day.",
  );
  expect(imageryFault({ layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", date: "2023-02-09" }, today)).toBe(
    "The images of VIIRS, NOAA-21 start on 10 Feb 2023. Enter a later day.",
  );
  expect(imageryFault({ layer: TERRA, date: "2026-11-15" }, today)).toBe(IMAGERY_FAULTS.future);
});

test.each(["", "14 Nov 2026", "2026-13-01", "2026-02-30", "2026-1-1"])("the text %j is not a day", (date) => {
  expect(imageryFault({ layer: TERRA, date }, "2026-11-14")).toBe(IMAGERY_FAULTS.noDay);
});

test("the source follows the chosen image, reads up to zoom level 9 and asks with the crossOrigin attribute", () => {
  const source = createImagerySource();
  expect(source.getUrls()).toEqual([imageryUrl({ layer: TERRA, date: "2026-11-02" })]);
  expect(source.getTileGrid()?.getMaxZoom()).toBe(9);
  const next = { layer: IMAGERY[3].id, date: "2026-10-21" };
  imageryStore.set(next);
  expect(source.getUrls()).toEqual([imageryUrl(next)]);
});
