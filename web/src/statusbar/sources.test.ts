import { expect, test } from "vitest";
import { SOURCES } from "./sources";

test("every source of the status bar has a name, a licence, a secure address and a use", () => {
  expect(SOURCES.length).toBe(3);
  for (const { name, licence, url, use } of SOURCES) {
    expect(name).not.toBe("");
    expect(licence).not.toBe("");
    expect(url.startsWith("https://")).toBe(true);
    expect(use.endsWith(".")).toBe(true);
  }
});
