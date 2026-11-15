// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { projectionName } from "./projection";

test("a projection is written by its name in the EPSG dataset and its code", () => {
  expect(projectionName("EPSG:3857")).toBe("WGS 84 / Pseudo-Mercator (EPSG:3857)");
  expect(projectionName("EPSG:4326")).toBe("WGS 84 (EPSG:4326)");
});

test("a projection without a known name is written by its code", () => {
  expect(projectionName("EPSG:32619")).toBe("EPSG:32619");
});
