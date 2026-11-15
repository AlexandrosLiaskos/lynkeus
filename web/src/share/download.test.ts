// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, expect, test, vi } from "vitest";
import { fileNamePart, saveFile, timeStamp } from "./download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("a file is given to the browser as a download link with its name, and the link leaves the page", () => {
  vi.useFakeTimers();
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:lynkeus/1");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const clicked: { href: string; download: string; onPage: boolean }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download, onPage: this.isConnected });
  });
  const content = new Blob(["{}"], { type: "application/geo+json" });

  saveFile(content, "lynkeus-area.geojson");

  expect(create).toHaveBeenCalledWith(content);
  expect(clicked).toEqual([{ href: "blob:lynkeus/1", download: "lynkeus-area.geojson", onPage: true }]);
  expect(document.querySelector("a")).toBeNull();
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(revoke).toHaveBeenCalledWith("blob:lynkeus/1");
});

test.each([
  ["Backscatter HH", "backscatter-hh"],
  ["  Coherence: 2026-10-09 / 2026-10-21 ", "coherence-2026-10-09-2026-10-21"],
  ["Éboulement à Zürich", "eboulement-a-zurich"],
  ['a\\b/c:d*e?f"g<h>i|j', "a-b-c-d-e-f-g-h-i-j"],
  ["---", ""],
])("the text %j becomes the part %j of a file name", (text, part) => {
  expect(fileNamePart(text)).toBe(part);
});

test("a time is written as the digits of its date and its clock", () => {
  expect(timeStamp(new Date(2026, 10, 14, 15, 30, 12))).toBe("20261114-153012");
  expect(timeStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102-030405");
});
