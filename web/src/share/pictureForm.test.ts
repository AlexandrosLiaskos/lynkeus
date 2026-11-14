import { expect, test } from "vitest";
import {
  FIRST_PICTURE_FORM,
  pictureSides,
  resolutionLabel,
  withResolution,
  withSide,
  withSize,
  type PictureForm,
} from "./pictureForm";

const SCREEN = [1052, 655] as const;
const CUSTOM: PictureForm = { ...FIRST_PICTURE_FORM, size: "custom", width: "1052", height: "655" };

test("the form first asks for the map as the screen shows it", () => {
  expect(pictureSides(FIRST_PICTURE_FORM, SCREEN)).toEqual([1052, 655]);
});

test("with the size of the screen, a higher resolution gives more pixels in proportion", () => {
  expect(pictureSides({ ...FIRST_PICTURE_FORM, resolution: 300 }, SCREEN)).toEqual([3288, 2047]);
  expect(pictureSides({ ...FIRST_PICTURE_FORM, resolution: 150 }, SCREEN)).toEqual([1644, 1023]);
});

test("a custom size starts from the sides that were shown", () => {
  expect(withSize({ ...FIRST_PICTURE_FORM, resolution: 150 }, "custom", SCREEN)).toMatchObject({
    size: "custom",
    width: "1644",
    height: "1023",
  });
  expect(withSize(CUSTOM, "screen", SCREEN).size).toBe("screen");
  expect(withSize({ ...CUSTOM, width: "800" }, "custom", SCREEN).width).toBe("800");
});

test("custom sides are read as numbers, and an empty or wrong side is not a number", () => {
  expect(pictureSides({ ...CUSTOM, width: "800", height: " 600 " }, SCREEN)).toEqual([800, 600]);
  expect(pictureSides({ ...CUSTOM, width: "", height: "wide" }, SCREEN)).toEqual([Number.NaN, Number.NaN]);
});

test("a change of the resolution changes custom sides in proportion and leaves a wrong side as typed", () => {
  expect(withResolution(CUSTOM, 300)).toMatchObject({ resolution: 300, width: "3288", height: "2047" });
  expect(withResolution({ ...CUSTOM, width: "wide", height: "" }, 300)).toMatchObject({ width: "wide", height: "" });
  expect(withResolution(FIRST_PICTURE_FORM, 150)).toEqual({ ...FIRST_PICTURE_FORM, resolution: 150 });
});

test("while the proportions are kept, the other side follows the side that is typed", () => {
  expect(withSide(CUSTOM, "width", "2104", SCREEN)).toMatchObject({ width: "2104", height: "1310" });
  expect(withSide(CUSTOM, "height", "1310", SCREEN)).toMatchObject({ width: "2104", height: "1310" });
  expect(withSide(CUSTOM, "width", "", SCREEN)).toMatchObject({ width: "", height: "655" });
  expect(withSide(CUSTOM, "width", "wide", SCREEN)).toMatchObject({ width: "wide", height: "655" });
});

test("without the proportions, each side is typed alone", () => {
  expect(withSide({ ...CUSTOM, proportions: false }, "width", "2104", SCREEN)).toMatchObject({
    width: "2104",
    height: "655",
  });
});

test("the resolution of the screen is named as such", () => {
  expect(resolutionLabel(96)).toBe("96 dots per inch, as the screen");
  expect(resolutionLabel(300)).toBe("300 dots per inch");
});
