// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { lengthLabel, metresPerPixel, scaleBar, scaleDenominator, scaleDifference } from "./scaleBar";

// One pixel of Web Mercator at zoom level 0 is the equator, 2 pi 6378137 metres, divided by 256 pixels.
const EQUATOR = 2 * Math.PI * 6378137;
const ZOOM_10 = EQUATOR / 256 / 2 ** 10;

test.each([
  [1, 200, 200, "200 m", 2],
  [1, 199, 100, "100 m", 2],
  [1, 60, 50, "50 m", 5],
  [152.874, 200, 20000, "20 km", 2],
  [0.01, 150, 1, "1 m", 2],
  [0.001, 150, 0.1, "10 cm", 2],
  [0.0001, 150, 0.01, "1 cm", 2],
  [0.00001, 150, 0.001, "1 mm", 2],
  [39135.76, 100, 2000000, "2000 km", 2],
])(
  "at %d metres per pixel the longest bar within %d pixels is %d metres long",
  (resolution, maxWidth, length, label, divisions) => {
    const bar = scaleBar(resolution, maxWidth);
    expect(bar.length).toBe(length);
    expect(bar.label).toBe(label);
    expect(bar.divisions).toBe(divisions);
    expect(bar.width).toBeCloseTo(length / resolution, 9);
    expect(bar.width).toBeLessThanOrEqual(maxWidth);
    // The next longer round length would not fit.
    expect(bar.width * 2.5).toBeGreaterThan(maxWidth);
  },
);

test.each([
  [5000, "5 km"],
  [1000, "1 km"],
  [999, "999 m"],
  [2, "2 m"],
  [0.5, "50 cm"],
  [0.005, "5 mm"],
])("a length of %d metres is written as %j", (metres, label) => {
  expect(lengthLabel(metres)).toBe(label);
});

test("a pixel of Web Mercator shows less ground at a higher latitude, by the cosine of the latitude", () => {
  expect(ZOOM_10).toBeCloseTo(152.8740565703525, 9);
  expect(metresPerPixel("EPSG:3857", ZOOM_10, fromLonLat([0, 0]))).toBeCloseTo(ZOOM_10, 6);
  // At the latitude of the sample area, 42.775 degrees, the cosine is 0.73403.
  const atMerrimack = metresPerPixel("EPSG:3857", ZOOM_10, fromLonLat([-70.975, 42.775]));
  expect(atMerrimack / ZOOM_10).toBeCloseTo(Math.cos((42.775 * Math.PI) / 180), 4);
  expect(scaleBar(atMerrimack, 200).label).toBe("20 km");
});

test("the scale differs between the centre and the corners of a picture that spans many latitudes", () => {
  const centre = fromLonLat([0, 40]);
  const near = [fromLonLat([-0.1, 39.95]), fromLonLat([0.1, 40.05])];
  const far = [fromLonLat([-30, 20]), fromLonLat([30, 60])];
  expect(scaleDifference("EPSG:3857", ZOOM_10, centre, near)).toBeLessThan(0.001);
  // cos 20 / cos 40 = 1.2267 and cos 60 / cos 40 = 0.6527, so the largest difference is 0.347.
  expect(scaleDifference("EPSG:3857", ZOOM_10, centre, far)).toBeCloseTo(0.347, 2);
});

test("the scale of a print follows from the ground length of a pixel and the dots per inch", () => {
  // At 254 dots per inch a pixel is 0.1 millimetres, so 10 metres per pixel is the scale 1:100,000.
  expect(scaleDenominator(10, 254)).toBeCloseTo(100000, 6);
  // At 96 dots per inch a pixel is 0.2646 millimetres.
  expect(scaleDenominator(26.4583333, 96)).toBeCloseTo(100000, 0);
});
