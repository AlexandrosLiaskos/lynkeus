import { expect, test } from "vitest";
import { pairProduct, realProduct, someProducts } from "../data/testProducts";
import { GROUPINGS, groupProducts } from "./groups";

test("without groups the list is one group without a heading", () => {
  const products = someProducts(3);
  expect(groupProducts(products, "none")).toEqual([{ title: "", products }]);
  expect(Object.keys(GROUPINGS)).toEqual(["none", "frame", "date", "interval", "maturity"]);
});

test("products are grouped by track and frame, in the order in which the frames first stand in the list", () => {
  const [first, second, third] = someProducts(3);
  if (!first || !second || !third) {
    throw new Error("the test has no products");
  }
  const other = { ...second, track: 69, direction: "ascending" } as const;
  const groups = groupProducts([first, other, third], "frame");
  expect(groups.map(({ title, products }) => [title, products.map(({ id }) => id)])).toEqual([
    ["Track 141, frame 67, descending", ["G0-ASF", "G2-ASF"]],
    ["Track 69, frame 67, ascending", ["G1-ASF"]],
  ]);
});

test("products are grouped by date, by the days between the dates of a pair and by level of validation", () => {
  const single = realProduct();
  const short = pairProduct("2026-10-09", "2026-10-21");
  const long = pairProduct("2026-07-17", "2026-08-10");
  const beta = { ...single, id: "beta", maturity: "Beta" } as const;
  expect(groupProducts([single, beta, short], "date").map(({ title, products }) => [title, products.length])).toEqual([
    ["21 Oct 2026", 2],
    ["9 Oct 2026 and 21 Oct 2026", 1],
  ]);
  expect(
    groupProducts([short, long, single, short], "interval").map(({ title, products }) => [title, products.length]),
  ).toEqual([
    ["12 days", 2],
    ["24 days", 1],
    ["One acquisition", 1],
  ]);
  expect(groupProducts([single, beta], "maturity").map(({ title }) => title)).toEqual(["Validated", "Beta"]);
});
