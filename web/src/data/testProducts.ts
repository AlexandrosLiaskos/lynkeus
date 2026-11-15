// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
// What the tests of the search share: products made from the record of a real product file, and a map.
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import gcov from "../../../api/tests/data/product-gcov.json";
import { isProduct, type Product, type ProductsFound } from "./products";

/** Return the product that the server reads from the record of a real backscatter product. */
export function realProduct(): Product {
  if (!isProduct(gcov)) {
    throw new Error("the product of the test is not valid");
  }
  return gcov;
}

/** Return the given number of products, with different identifiers and with dates 12 days apart, the latest first. */
export function someProducts(count: number, first = 0): Product[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 21) - (first + index) * 12 * 86_400_000).toISOString().slice(0, 10);
    return { ...realProduct(), id: `G${String(first + index)}-ASF`, dates: [day] };
  });
}

/** Return a product of a pair of acquisitions on the frame of the real product. */
export function pairProduct(first: string, second: string): Product {
  return {
    ...realProduct(),
    id: `G-${first}-ASF`,
    product: "GUNW",
    dates: [first, second],
    channels: ["HH"],
    side_channels: [],
    bands: ["A"],
    side_bandwidth: null,
    size: null,
  };
}

/** Return a fetch function that answers every request with the given answers in turn, and records the addresses. */
export function serverWith(...answers: (ProductsFound | { status: number; detail: string } | object)[]) {
  const asked: string[] = [];
  let turn = 0;
  const fetch = (address: string) => {
    asked.push(address);
    const answer = answers[Math.min(turn, answers.length - 1)];
    turn += 1;
    const status = answer && "status" in answer && typeof answer.status === "number" ? answer.status : 200;
    return Promise.resolve(new Response(JSON.stringify(answer), { status }));
  };
  return { fetch, asked };
}

/** Return a map of 800 by 600 pixels that shows the coast of Massachusetts. */
export function testMap(): OlMap {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
  map.setSize([800, 600]);
  return map;
}
