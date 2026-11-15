// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { KEPT, KEPT_PLACES, statementOf, type KeptPlace } from "./kept";

/** The table "What is kept" of docs/Storage.md, as its places and their statements, in the order of the table. */
function table(): [string, string][] {
  const document = readFileSync("../docs/Storage.md", "utf8");
  const start = document.indexOf("## What is kept");
  const end = document.indexOf("\n## ", start + 1);
  return document
    .slice(start, end === -1 ? undefined : end)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Place ") && !line.startsWith("|---"))
    .map((line) => {
      const [place = "", statement = ""] = line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim());
      return [place, statement];
    });
}

test("the statements of what is kept are the rows of the table of docs/Storage.md, word for word and in its order", () => {
  const places = Object.keys(KEPT) as KeptPlace[];
  expect(table()).toEqual(places.map((place) => [KEPT_PLACES[place], statementOf(place)]));
  expect(table()).toHaveLength(8);
  expect(readFileSync("../docs/Storage.md", "utf8")).toContain(
    "The pane Storage and the dialog About copy these statements.",
  );
});

test("a statement is held as its sentences, each of which ends with a full stop", () => {
  for (const sentences of Object.values(KEPT)) {
    for (const sentence of sentences) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
    }
  }
  expect(KEPT.nasa).toHaveLength(3);
});

test("the time for which NASA Harmony keeps a file is the one that the research note of the Data part records", () => {
  expect(KEPT.nasa[0]).toContain("keeps it for 30 days");
  expect(readFileSync("../docs/research/data.md", "utf8")).toContain("its files stay for 30 days");
});

test("the token and the cookie are kept as the statements say: the page stores neither", () => {
  // The page reaches the storage of the browser in one file, which stores only what a part declares.
  const session = readFileSync("src/data/session.ts", "utf8");
  expect(session).not.toMatch(/localStorage|sessionStorage|document\.cookie|keepInBrowser/);
});
