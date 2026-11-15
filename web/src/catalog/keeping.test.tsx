// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import OlMap from "ol/Map";
import View from "ol/View";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetJobs } from "../data/jobs";
import { layersStore, loadLayers, resetLayers, type LayerEntry } from "../data/layers";
import { loadSeries, resetSeries, seriesStore } from "../data/series";
import { pairSeries, seriesItem } from "../data/testSeries";
import { layer } from "../data/testSession";
import { keeper, keptLayer, keptSeries, type Keeper } from "../data/testStorage";
import { limitsStore, resetLimits } from "../header/notice/limits";
import { SAMPLE, sampleWith } from "../header/notice/testLimits";
import { OFFICE, OFFICE_NAME } from "../servers/testServers";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { serversStore } from "../shared/servers";
import { CatalogPane } from "./CatalogPane";
import {
  dayWords,
  extendAll,
  extendedWords,
  isNear,
  keepLabel,
  keptAllWords,
  NEAR_WORDS,
  removalSentence,
  removalsOf,
  seriesUntilWords,
  untilWords,
  WARNING_DAYS,
} from "./keeping";
import { ABOUT_JOBS } from "./JobsSection";
import { ABOUT_LAYERS, LayersSection } from "./LayersSection";
import { ABOUT_SERIES_LIST, SeriesSection } from "./SeriesSection";

/** The moment of the tests: 15 November 2026, 12:00 UTC. */
const NOW = Date.parse("2026-11-15T12:00:00Z");
const SOON = "2026-11-17T09:00:00Z";
const LATER = "2026-11-28T16:25:00Z";

const BACKSCATTER = keptLayer(
  {
    layer: layer({ id: "back", title: "Backscatter HH, 21 Oct 2026" }),
    size: 57_200_000,
    created: "2026-11-14T16:25:00Z",
  },
  LATER,
);
const COHERENCE = keptLayer(
  {
    layer: layer({ id: "coh", title: "Coherence HH, 9 and 21 Oct 2026" }),
    size: 12_400_000,
    created: "2026-11-13T09:00:00Z",
  },
  SOON,
);
const OWN = {
  layer: layer({ id: "own", title: "Backscatter VV, 21 Oct 2026", url: `/api/servers/${OFFICE.id}/files/own/vv.tif` }),
  size: 81_000_000,
  created: "2026-11-12T17:00:00Z",
  server: OFFICE_NAME,
};
const SERIES = keptSeries(seriesItem(), LATER);
const PAIRS = keptSeries(seriesItem(pairSeries()), SOON);

const entry = (until?: string, server: LayerEntry["server"] = null): LayerEntry => ({
  layer: layer(),
  size: null,
  created: null,
  server,
  ...(until === undefined ? {} : { keptUntil: until }),
});

let stand: Keeper;
let map: OlMap;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  resetJobs();
  resetLayers();
  resetSeries();
  resetLimits();
  serversStore.set(null);
  mapLayersStore.set([]);
  messagesStore.set([]);
  stand = keeper();
  stand.server.limits = SAMPLE;
  map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  map.setSize([800, 600]);
});

afterEach(() => {
  resetJobs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);
const lastLines = () =>
  [...document.querySelectorAll(".layer .catalog-pick .item-line:last-child")].map((line) => line.textContent);

/** Wait for the answers to the requests that are on their way. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
  });
}

async function showLayers(layers = [BACKSCATTER, COHERENCE, OWN]) {
  stand.server.layers = layers;
  render(
    <MapContext value={map}>
      <main tabIndex={0} aria-label="Map" />
      <LayersSection />
    </MapContext>,
  );
  await act(() => loadLayers());
  await settle();
}

async function showSeries(items = [SERIES, PAIRS]) {
  stand.server.series = items;
  render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <SeriesSection />
    </>,
  );
  await act(() => loadSeries());
  await settle();
}

/** Open the menu "More" of a layer or a series and return the names of its commands. */
async function moreOf(title: string): Promise<string[]> {
  await userEvent.click(screen.getByRole("button", { name: `More commands of ${title}` }));
  return screen.getAllByRole("menuitem").map((command) => command.textContent);
}

const choose = (command: string) => userEvent.click(within(screen.getByRole("menu")).getByText(command));

test("the days of the warning are the three days of docs/Storage.md", () => {
  expect(WARNING_DAYS).toBe(3);
  const document = readFileSync("../docs/Storage.md", "utf8").replace(/\s+/g, " ");
  expect(document).toContain(
    'The Catalog shows "Kept until <date>" for each layer and series of the project server, with the command Keep 14 more days (the number is read from the limits). Three days before the moment the row carries a warning, and the page says once per opening how many layers and series are removed within three days, with Keep all and the reminder to download.',
  );
  expect(NEAR_WORDS).toBe("which is within 3 days");
});

test("something is near its removal from three days before its moment", () => {
  expect(isNear("2026-11-18T12:00:00Z", NOW)).toBe(true);
  expect(isNear("2026-11-18T12:00:01Z", NOW)).toBe(false);
  // What has passed its moment waits for the next removal run.
  expect(isNear("2026-11-15T11:59:00Z", NOW)).toBe(true);
  expect(isNear(null, NOW)).toBe(false);
  expect(isNear(undefined, NOW)).toBe(false);
});

test("a layer says until when it is kept: until its date on the project server, and until its removal on a server of the visitor", () => {
  expect(dayWords("2026-11-28T16:25:00Z")).toBe("28 Nov 2026");
  expect(untilWords(entry(LATER))).toBe("Kept until 28 Nov 2026");
  expect(untilWords(entry())).toBeNull();
  expect(untilWords(entry(undefined, OFFICE_NAME))).toBe("Kept until you remove it");
  expect(seriesUntilWords(SERIES)).toBe("Kept until 28 Nov 2026");
  expect(seriesUntilWords(seriesItem())).toBeNull();
  expect(seriesUntilWords(keptSeries(seriesItem(), null))).toBeNull();
});

test("the command that keeps longer names the keeping time of the limits, and no time while they are not known", () => {
  expect(keepLabel(SAMPLE)).toBe("Keep 14 more days");
  expect(keepLabel(sampleWith({ keep_time: 86400 }))).toBe("Keep 1 more day");
  expect(keepLabel(sampleWith({ keep_time: 43200 }))).toBe("Keep 12 more hours");
  expect(keepLabel(null)).toBe("Keep longer");
  expect(keptAllWords(SAMPLE)).toBe("Every layer and series of your account is kept for 14 days from now.");
  expect(keptAllWords(null)).toBe("Every layer and series of your account is kept longer.");
  expect(extendedWords("layer", "Athens", LATER)).toBe('The layer "Athens" is kept until 28 Nov 2026.');
  expect(extendedWords("series", "Athens", undefined)).toBe('The series "Athens" is kept longer.');
  expect(readFileSync("src/catalog/keeping.ts", "utf8")).not.toMatch(/\b\d+ (more )?(days?|hours?)\b/);
});

test("the removals within the days of the warning are counted among the layers of the project server and the series", () => {
  const layers = [entry(SOON), entry(LATER), entry(), entry(SOON, OFFICE_NAME)];
  expect(removalsOf(layers, [PAIRS, SERIES, seriesItem()], NOW)).toEqual({ layers: 1, series: 1 });
  expect(removalSentence({ layers: 2, series: 1 })).toBe(
    "2 layers and 1 series are removed from the project server within 3 days. A file that you download is the permanent copy.",
  );
  expect(removalSentence({ layers: 1, series: 0 })).toBe(
    "1 layer is removed from the project server within 3 days. A file that you download is the permanent copy.",
  );
  expect(removalSentence({ layers: 0, series: 2 })).toBe(
    "2 series are removed from the project server within 3 days. A file that you download is the permanent copy.",
  );
  expect(removalSentence({ layers: 0, series: 0 })).toBeNull();
});

test("each layer shows until when it is kept, and one that is removed within three days carries a warning", async () => {
  serversStore.set({ servers: [OFFICE], limit: 8 });
  await showLayers();
  expect(lastLines()).toEqual([
    "21 Oct 2026 · 57 MB · On the project server · Kept until 28 Nov 2026",
    "21 Oct 2026 · 12 MB · On the project server · Kept until 17 Nov 2026, which is within 3 days",
    "21 Oct 2026 · 81 MB · On Office computer · Kept until you remove it",
  ]);
  const warnings = [...document.querySelectorAll(".catalog-near")];
  expect(warnings.map((warning) => warning.textContent)).toEqual(["Kept until 17 Nov 2026, which is within 3 days"]);
  expect(warnings[0]?.querySelector("svg.usa-icon use")?.getAttribute("href")).toMatch(/#warning$/);
});

test("a layer of the project server is kept for the keeping time from now by the command of its menu", async () => {
  await showLayers();
  expect(await moreOf("Coherence HH, 9 and 21 Oct 2026")).toEqual([
    "Zoom to",
    "Details",
    "Download GeoTIFF",
    "Keep 14 more days",
    "Rename",
    "Remove",
  ]);
  await choose("Keep 14 more days");
  await settle();
  expect(stand.server.sent("POST", "/api/layers/coh/extension")).toHaveLength(1);
  expect(layersStore.get().map((listed) => listed.keptUntil)).toEqual([LATER, stand.until, undefined]);
  expect(messages()).toEqual([["info", 'The layer "Coherence HH, 9 and 21 Oct 2026" is kept until 1 Dec 2026.']]);
  expect(lastLines()[1]).toBe("21 Oct 2026 · 12 MB · Kept until 1 Dec 2026");
  expect(document.querySelector(".catalog-near")).toBeNull();
  // A layer of a server of the visitor has no such command: that computer keeps it until he removes it.
  await userEvent.keyboard("{Escape}");
  expect(await moreOf("Backscatter VV, 21 Oct 2026")).toEqual([
    "Zoom to",
    "Details",
    "Download GeoTIFF",
    "Rename",
    "Remove",
  ]);
});

test("an extension that the server refuses is reported, and the date stays", async () => {
  await showLayers([COHERENCE]);
  stand.refuse("POST", "/api/layers/", 404, "Your account has no layer of this name on the project server.");
  await moreOf("Coherence HH, 9 and 21 Oct 2026");
  await choose("Keep 14 more days");
  await settle();
  expect(messages()).toEqual([["error", "Your account has no layer of this name on the project server."]]);
  expect(layersStore.get()[0]?.keptUntil).toBe(SOON);
});

test("the details of a layer state until when it is kept, and who reads its file", async () => {
  await showLayers([BACKSCATTER, OWN]);
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Details");
  const dialog = screen.getByRole("dialog", { name: "Layer: Backscatter HH, 21 Oct 2026" });
  const rows = [...dialog.querySelectorAll(".property-row")].map(
    (row) =>
      `${row.querySelector(".property-name > span")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
  expect(rows).toContain("Kept until: 28 Nov 2026, 16:25:00 UTC");
  expect(
    within(dialog).getByText("The file of a layer is read by whoever holds its address, until the layer is removed."),
  ).toBeDefined();
  expect(within(dialog).getByRole("button", { name: "Information about GeoTIFF file" })).toBeDefined();
});

test("each series shows until when it is kept, carries the warning, and is kept longer from its menu", async () => {
  await showSeries();
  expect(lastLines().map((line) => line.split(" · ").at(-1))).toEqual([
    "Kept until 28 Nov 2026",
    "Kept until 17 Nov 2026, which is within 3 days",
  ]);
  const title = pairSeries().title;
  expect(await moreOf(title)).toEqual(["Keep 14 more days", "Rename", "Remove"]);
  await choose("Keep 14 more days");
  await settle();
  expect(stand.server.sent("POST", `/api/series/${pairSeries().id}/extension`)).toHaveLength(1);
  expect(seriesStore.get().map((item) => item.kept_until)).toEqual([LATER, stand.until]);
  expect(messages()).toEqual([["info", `The series "${title}" is kept until 1 Dec 2026.`]]);
  expect(document.querySelector(".catalog-near")).toBeNull();
});

test("a series without a stated date shows none, and its command names no time while the limits are not known", async () => {
  stand.server.limits = null;
  await showSeries([seriesItem()]);
  expect(lastLines()[0]).not.toContain("Kept until");
  expect(await moreOf(seriesItem().series.title)).toEqual(["Keep longer", "Rename", "Remove"]);
  expect(limitsStore.get()).toBeNull();
});

test("Keep all keeps every layer and series of the account, and the lists state the new dates", async () => {
  stand.server.layers = [BACKSCATTER, COHERENCE, OWN];
  stand.server.series = [PAIRS];
  await Promise.all([loadLayers(), loadSeries()]);
  await extendAll();
  expect(stand.server.sent("POST", "/api/storage/extension")).toHaveLength(1);
  expect(layersStore.get().map((listed) => listed.keptUntil)).toEqual([stand.until, stand.until, undefined]);
  expect(seriesStore.get().map((item) => item.kept_until)).toEqual([stand.until]);
  stand.refuse("POST", "/api/storage", 500, null);
  await expect(extendAll()).rejects.toThrow(
    "The layers and the series could not be kept longer (the server answered 500).",
  );
});

test("the Catalog pane says in one notice how many layers and series are removed within three days, with Keep all", async () => {
  stand.server.layers = [BACKSCATTER, COHERENCE, OWN];
  stand.server.series = [SERIES, PAIRS];
  render(
    <MapContext value={map}>
      <main tabIndex={0} aria-label="Map" />
      <CatalogPane />
    </MapContext>,
  );
  expect(screen.queryByRole("button", { name: "Keep all" })).toBeNull();
  await act(() => Promise.all([loadLayers(), loadSeries()]));
  await settle();
  const notices = [...document.querySelectorAll(".notice--warning")];
  expect(notices).toHaveLength(1);
  expect(notices[0]?.querySelector(".notice-text")?.textContent).toBe(
    "1 layer and 1 series are removed from the project server within 3 days. A file that you download is the permanent copy.",
  );
  // The notice stands over the sections, and not among them.
  expect(notices[0]?.nextElementSibling?.className).toBe("catalog");
  await userEvent.click(screen.getByRole("button", { name: "Keep all" }));
  await settle();
  expect(stand.server.sent("POST", "/api/storage/extension")).toHaveLength(1);
  expect(messages()).toEqual([["info", "Every layer and series of your account is kept for 14 days from now."]]);
  expect(document.querySelector(".notice--warning")).toBeNull();
  expect(document.querySelector(".catalog-near")).toBeNull();
});

test("the notice leaves when the one layer that is removed soon is kept longer, and a refusal of Keep all is reported", async () => {
  stand.server.layers = [COHERENCE];
  render(
    <MapContext value={map}>
      <main tabIndex={0} aria-label="Map" />
      <CatalogPane />
    </MapContext>,
  );
  await act(() => loadLayers());
  await settle();
  expect(document.querySelector(".notice--warning .notice-text")?.textContent).toMatch(/^1 layer is removed /);
  stand.refuse("POST", "/api/storage", 503, "The server is busy. Try again in a few minutes.");
  await userEvent.click(screen.getByRole("button", { name: "Keep all" }));
  await settle();
  expect(messages()).toEqual([["error", "The server is busy. Try again in a few minutes."]]);
  expect(document.querySelector(".notice--warning")).not.toBeNull();
  stand.accept();
  await moreOf("Coherence HH, 9 and 21 Oct 2026");
  await choose("Keep 14 more days");
  await settle();
  expect(document.querySelector(".notice--warning")).toBeNull();
});

test("the explanations of the sections name the account, and no session", () => {
  for (const explanation of [ABOUT_JOBS, ABOUT_LAYERS, ABOUT_SERIES_LIST]) {
    expect(explanation).toContain("your Earthdata account");
    expect(explanation).not.toMatch(/\bsession\b/);
    expect(explanation.match(/\.( |$)/g)).toHaveLength(3);
  }
  expect(ABOUT_LAYERS).toContain(
    "The project server keeps the files of a layer until the date that the layer states, and a server of yours keeps them until you remove the layer.",
  );
  expect(ABOUT_SERIES_LIST).toContain(
    "The project server keeps a series until the date that the series states, or until you remove it.",
  );
});
