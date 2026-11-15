// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { formatDay, pairDays, type Product } from "../data/products";

/** The ways in which the list of products can be grouped, with the words that name them. */
export const GROUPINGS = {
  none: "No groups",
  frame: "Track and frame",
  date: "Date",
  interval: "Days between the dates of a pair",
  maturity: "Level of validation",
} as const;
export type Grouping = keyof typeof GROUPINGS;

/** A group of the list: its heading and its products, in the order of the list. */
export interface ProductGroup {
  title: string;
  products: Product[];
}

function titleOf(product: Product, grouping: Exclude<Grouping, "none">): string {
  switch (grouping) {
    case "frame":
      return `Track ${String(product.track)}, frame ${String(product.frame)}, ${product.direction}`;
    case "date":
      return product.dates.map(formatDay).join(" and ");
    case "interval": {
      const days = pairDays(product);
      return days === null ? "One acquisition" : `${String(days)} days`;
    }
    case "maturity":
      return product.maturity;
  }
}

/**
 * Divide the products into groups. The groups stand in the order in which their first products stand in the
 * list, and the products of a group keep the order of the list.
 */
export function groupProducts(products: readonly Product[], grouping: Grouping): ProductGroup[] {
  if (grouping === "none") {
    return [{ title: "", products: [...products] }];
  }
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const title = titleOf(product, grouping);
    const group = groups.get(title);
    if (group) {
      group.push(product);
    } else {
      groups.set(title, [product]);
    }
  }
  return [...groups].map(([title, members]) => ({ title, products: members }));
}
