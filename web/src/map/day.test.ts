import { expect, test } from "vitest";
import { formatDate } from "./day";

test("a day is written with the name of its month", () => {
  expect(formatDate("2026-10-21")).toBe("21 Oct 2026");
  expect(formatDate("2026-11-02")).toBe("2 Nov 2026");
  expect(formatDate("2026-09-27")).toBe("27 Sep 2026");
});
