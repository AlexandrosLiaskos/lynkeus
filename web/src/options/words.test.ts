// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { type LayerEntry } from "../data/layers";
import { seriesItem } from "../data/testSeries";
import { job, layer } from "../data/testSession";
import { SAMPLE } from "../header/notice/testLimits";
import { OFFICE_NAME } from "../servers/testServers";
import {
  accountLimits,
  countLine,
  DATA_FOLDERS,
  everythingWords,
  filesSize,
  folderInfo,
  folderOf,
  jobsLine,
  jobsUntilWords,
  LINUX_SET_FOLDER,
  nextRemoval,
  nextRemovalWords,
  ofMost,
  projectJobs,
  projectLayers,
  sizeLine,
} from "./words";

const entry = (id: string, size: number | null, keptUntil?: string): LayerEntry => ({
  layer: layer({ id, title: `Layer ${id}` }),
  size,
  created: null,
  server: null,
  ...(keptUntil === undefined ? {} : { keptUntil }),
});
const OWN: LayerEntry = { layer: layer({ id: "own" }), size: 5_000_000, created: null, server: OFFICE_NAME };

test("an amount stands beside its limit, and alone while the limit is not known", () => {
  expect(ofMost("12", "50")).toBe("12 of at most 50");
  expect(ofMost("12", null)).toBe("12");
  expect(countLine(1200, 5000)).toBe("1,200 of at most 5,000");
  expect(countLine(3, null)).toBe("3");
});

test("only the layers and the jobs of the project server count towards the limits of the account", () => {
  expect(projectLayers([entry("a", 1), OWN]).map(({ layer: described }) => described.id)).toEqual(["a"]);
  expect(
    projectJobs([
      job({ jobID: "one" }),
      job({ jobID: "two", server: null }),
      job({ jobID: "away", server: OFFICE_NAME }),
    ]).map((listed) => listed.jobID),
  ).toEqual(["one", "two"]);
});

test("the size of the files is their sum, and the least that they take where a size is not stated", () => {
  expect(filesSize([entry("a", 1_500_000_000), entry("b", 250_000_000)])).toEqual({
    bytes: 1_750_000_000,
    complete: true,
  });
  expect(sizeLine({ bytes: 1_750_000_000, complete: true }, 2_000_000_000)).toBe("1.8 GB of at most 2 GB");
  expect(filesSize([entry("a", 4_000_000), entry("b", null)])).toEqual({ bytes: 4_000_000, complete: false });
  expect(sizeLine({ bytes: 4_000_000, complete: false }, null)).toBe("At least 4 MB");
  expect(sizeLine(filesSize([]), 2_000_000_000)).toBe("0 bytes of at most 2 GB");
});

test("the row of the jobs counts their records and the ones that wait or run", () => {
  const jobs = [job({ status: "accepted" }), job({ status: "running" }), job({ status: "failed" })];
  expect(jobsLine(jobs, 4)).toBe("3 records, 2 of at most 4 waiting or running");
  expect(jobsLine([job({ status: "successful" })], null)).toBe("1 record, 0 waiting or running");
  expect(jobsUntilWords(SAMPLE.limits.keep_time)).toBe(
    "Until its layer or series is removed; a failed or cancelled job for 14 days",
  );
  expect(jobsUntilWords(null)).toBe(
    "Until its layer or series is removed; a failed or cancelled job for the keeping time",
  );
});

test("the next removal is the earliest date among the layers and the series of the project server", () => {
  const layers = [entry("a", 1, "2026-11-28T16:25:00Z"), entry("b", 1, "2026-11-24T09:00:00Z"), entry("c", 1), OWN];
  const series = [{ ...seriesItem(), kept_until: "2026-11-26T00:00:00Z" }];
  expect(nextRemoval(layers, series)).toEqual({ until: "2026-11-24T09:00:00Z", what: 'the layer "Layer b"' });
  expect(nextRemovalWords(nextRemoval(layers, series))).toBe('24 Nov 2026, 09:00:00 UTC: the layer "Layer b"');
  expect(
    nextRemoval([entry("a", 1, "2026-11-28T16:25:00Z")], [{ ...seriesItem(), kept_until: "2026-11-20T13:02:11Z" }])
      ?.what,
  ).toBe('the series "Backscatter HH, mean of the area"');
  // A layer of a server of the visitor, and a layer or a series without a date, wait for no removal.
  expect(nextRemoval([OWN, entry("c", 1)], [seriesItem(), { ...seriesItem(), kept_until: null }])).toBeNull();
  expect(nextRemovalWords(null)).toBe("No layer or series states a date");
});

test("the confirmation of the removal of everything names what goes and what stays", () => {
  expect(everythingWords({ unfinished: 2, layers: 1, series: 0 })).toEqual([
    "The project server ends your 2 waiting or running jobs and removes your 1 layer with its files, your 0 series and the records of your jobs. This cannot be undone.",
    "Your servers and their layers, the files that you downloaded and what this browser keeps stay as they are, and you stay signed in.",
  ]);
  expect(everythingWords({ unfinished: 0, layers: 12, series: 3 })[0]).toBe(
    "The project server removes your 12 layers with their files, your 3 series and the records of your jobs. This cannot be undone.",
  );
  // What stays is what DELETE /api/storage of docs/Storage.md does not touch.
  expect(readFileSync("../docs/Storage.md", "utf8").replace(/\s+/g, " ")).toContain(
    "End the jobs of the account and remove its layers, series and job records from the project server. The servers of the account and their layers are not touched.",
  );
});

test("the folder of Lynkeus Server on each system is the one of the program and of docs/Own_Servers.md", () => {
  expect(folderOf("Windows 11")).toEqual({ system: "windows", folder: "%LOCALAPPDATA%\\Lynkeus" });
  expect(folderOf("macOS 15.1")).toEqual({ system: "macos", folder: "~/Library/Application Support/Lynkeus" });
  expect(folderOf("Ubuntu 24.04")).toEqual({ system: "linux", folder: "~/.local/share/lynkeus" });
  expect(folderOf("Unknown system")).toBeNull();
  expect(readFileSync("../docs/Own_Servers.md", "utf8")).toContain(
    `| Data folder | \`${DATA_FOLDERS.windows}\` | \`${DATA_FOLDERS.macos}\` | \`${LINUX_SET_FOLDER}\`, by default \`${DATA_FOLDERS.linux}\` |`,
  );
  const program = readFileSync("../api/src/lynkeus/computer.py", "utf8");
  expect(program).toContain(
    "``%LOCALAPPDATA%\\Lynkeus`` on Windows, ``~/Library/Application Support/Lynkeus`` on macOS, and\n        elsewhere ``$XDG_DATA_HOME/lynkeus``, which is ``~/.local/share/lynkeus`` when the variable is",
  );
  expect(folderInfo("linux")).toContain(`the folder is ${LINUX_SET_FOLDER}.`);
  expect(folderInfo("windows")).not.toContain("XDG_DATA_HOME");
  expect(folderInfo(null)).toBe(folderInfo("macos"));
});

test("the limits of the account are those of the answer of the server, and null while it is not known", () => {
  expect(accountLimits(SAMPLE.limits)).toEqual({
    layers: 50,
    series: 20,
    size: 2000000000,
    unfinished: 4,
    keep: 1209600,
  });
  expect(accountLimits(null)).toEqual({ layers: null, series: null, size: null, unfinished: null, keep: null });
});
