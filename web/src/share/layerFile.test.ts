import { afterEach, expect, test, vi } from "vitest";
import { layerFileName, saveAddress } from "./layerFile";

afterEach(() => {
  vi.restoreAllMocks();
});

test.each([
  ["Backscatter HH, 21 Oct 2026", ["2026-10-21"], "backscatter-hh-20261021.tif"],
  ["Coherence, 9 Oct 2026 to 21 Oct 2026", ["2026-10-09", "2026-10-21"], "coherence-20261009-20261021.tif"],
  ["Backscatter HH, 21 October 2026", ["2026-10-21"], "backscatter-hh-20261021.tif"],
  ["Change of backscatter", ["2026-10-21", "2026-11-02"], "change-of-backscatter-20261021-20261102.tif"],
  ["Flood 2026-10-21 north", ["2026-10-21"], "flood-north-20261021.tif"],
  ["21 Oct 2026", ["2026-10-21"], "layer-20261021.tif"],
  ["Soil moisture, 1 Jan 2027", ["2027-01-01"], "soil-moisture-20270101.tif"],
  ["Coherence, 9 Oct 2026 to 19 Oct 2026", ["2026-10-09", "2026-10-19"], "coherence-20261009-20261019.tif"],
])("the layer %j with the dates %j is saved as %j", (title, dates, name) => {
  expect(layerFileName({ title, dates }, "tif")).toBe(name);
});

test("the ending of the name is the one that is asked for", () => {
  expect(layerFileName({ title: "Backscatter HH, 21 Oct 2026", dates: ["2026-10-21"] }, "json")).toBe(
    "backscatter-hh-20261021.json",
  );
});

test("a file of the site is given to the browser as a download link with its name", () => {
  const clicked: { href: string; download: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  saveAddress("/files/abc/gcov-hhhh-20261021.tif", "backscatter-hh-20261021.tif");
  expect(clicked).toEqual([{ href: "/files/abc/gcov-hhhh-20261021.tif", download: "backscatter-hh-20261021.tif" }]);
  expect(document.querySelector("a")).toBeNull();
});
