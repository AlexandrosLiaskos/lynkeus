import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { areaStore } from "../shared/area";
import { openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { resetPanes } from "../shared/panes";
import { resetStorage, setPartKept, storageStore } from "../shared/storage/storage";
import { rectangleText } from "./AreaFields";
import { GetLayerForm } from "./GetLayerPane";
import { firstDraft, type SearchDraft } from "./search";
import { SearchPane } from "./SearchPane";
import { GET_LAYER_PANE, SEARCH_PANE, searchDraftStore } from "./state";
import { isSearchDraft, SEARCH_KEY, startDraft } from "./storedSearch";
import { testMap } from "./testProducts";
import { standIn } from "./testSession";

const TODAY = new Date("2026-11-14T12:00:00Z");
const RECTANGLE = rectangleText({ west: 22.2, south: 36.4, east: 22.6, north: 36.9 });
const RING = [
  [22.2, 36.4],
  [22.6, 36.4],
  [22.6, 36.9],
  [22.2, 36.4],
] as const;

/** A form that differs from the first one in every group of choices. */
const DRAFT: SearchDraft = {
  ...firstDraft(RECTANGLE, TODAY),
  product: "GUNW",
  maturity: ["Beta"],
  period: "custom",
  start: "2026-01-01",
  end: "2026-03-31",
  season: { start: { month: 6, day: 1 }, end: { month: 8, day: 31 } },
  pairInside: true,
  track: "12-15",
  direction: "ascending",
  channels: ["HH", "HV"],
  bands: ["A"],
  bandwidth: 20,
  coverage: "full",
  joint: "no",
};

function stored(): unknown {
  const text = window.localStorage.getItem(SEARCH_KEY);
  return text === null ? null : JSON.parse(text);
}

function store(value: unknown): void {
  window.localStorage.setItem(SEARCH_KEY, JSON.stringify({ v: 1, value }));
}

function showSearch(): void {
  render(
    <MapContext value={testMap()}>
      <SearchPane />
    </MapContext>,
  );
}

function showGetLayer(): void {
  render(
    <MapContext value={testMap()}>
      <GetLayerForm
        found={[]}
        selected={null}
        products={[]}
        session="signed-in"
        onSignIn={() => undefined}
        onSearch={() => undefined}
        onSelect={() => undefined}
      />
    </MapContext>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  areaStore.set(null);
  searchDraftStore.set(null);
  resetDock();
  resetPanes();
  window.localStorage.clear();
  resetStorage();
  standIn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the form of the search is a part that the browser keeps, and every change of it is stored", () => {
  expect(storageStore.get().parts.find(({ key }) => key === SEARCH_KEY)).toMatchObject({
    title: "Search form",
    kept: true,
  });
  searchDraftStore.set(DRAFT);
  expect(stored()).toEqual({ v: 1, value: DRAFT });
  searchDraftStore.set({ ...DRAFT, track: "20" });
  expect(stored()).toMatchObject({ value: { track: "20" } });
  // A form that is not filled yet leaves the stored one as it is.
  searchDraftStore.set(null);
  expect(stored()).toMatchObject({ value: { track: "20" } });
});

test("the stored form is not restored when the page opens", async () => {
  store(DRAFT);
  vi.resetModules();
  await import("./storedSearch");
  const state = await import("./state");
  expect(state.searchDraftStore.get()).toBeNull();
  expect(stored()).toEqual({ v: 1, value: DRAFT });
});

test("the search pane takes the stored form when it first opens, and not before", () => {
  store(DRAFT);
  showSearch();
  expect(searchDraftStore.get()).toBeNull();
  act(() => openToolPane(SEARCH_PANE));
  expect(searchDraftStore.get()).toEqual(DRAFT);
});

test("the pane Get layer takes the stored form when it opens before the search pane", () => {
  store(DRAFT);
  showGetLayer();
  expect(searchDraftStore.get()).toBeNull();
  act(() => openToolPane(GET_LAYER_PANE));
  expect(searchDraftStore.get()).toEqual(DRAFT);
});

test("a form that the page already holds is not replaced by the stored one", () => {
  showSearch();
  act(() => openToolPane(SEARCH_PANE));
  const first = searchDraftStore.get();
  expect(first?.product).toBe("GCOV");
  store(DRAFT);
  showGetLayer();
  act(() => openToolPane(GET_LAYER_PANE));
  expect(searchDraftStore.get()).toBe(first);
});

test("the first form is used when the switch of the form is off", () => {
  areaStore.set({ west: 1, south: 2, east: 3, north: 4 });
  setPartKept(SEARCH_KEY, false);
  store(DRAFT);
  showSearch();
  act(() => openToolPane(SEARCH_PANE));
  expect(searchDraftStore.get()).toEqual(firstDraft(rectangleText({ west: 1, south: 2, east: 3, north: 4 }), TODAY));
});

test("the first form is used when the stored form is not valid, and the stored form is removed", () => {
  store({ ...DRAFT, product: "SLC" });
  showSearch();
  act(() => openToolPane(SEARCH_PANE));
  expect(searchDraftStore.get()?.product).toBe("GCOV");
  expect(searchDraftStore.get()?.period).toBe("30-days");
  expect(stored()).toMatchObject({ value: { product: "GCOV" } });
});

test("a stored form with an offered period takes the days of that period as they are today", () => {
  store({ ...DRAFT, period: "30-days", start: "2026-01-01", end: "2026-01-31" });
  expect(startDraft(testMap(), TODAY)).toMatchObject({ period: "30-days", start: "2026-10-15", end: "2026-11-14" });
  store(DRAFT);
  expect(startDraft(testMap(), TODAY)).toMatchObject({ period: "custom", start: "2026-01-01", end: "2026-03-31" });
});

test("the first form and a form with polygons are valid forms", () => {
  expect(isSearchDraft(firstDraft(RECTANGLE, TODAY))).toBe(true);
  expect(isSearchDraft(DRAFT)).toBe(true);
  expect(isSearchDraft({ ...DRAFT, area: { kind: "polygons", rings: [RING] } })).toBe(true);
  expect(isSearchDraft({ ...DRAFT, by: "names", names: "NISAR_L2_*\nNISAR_L2_GCOV_?" })).toBe(true);
  expect(isSearchDraft({ ...DRAFT, start: "", end: "", bandwidth: "", season: null })).toBe(true);
});

test.each([
  ["the value is a list", [DRAFT]],
  ["the value is null", null],
  ["a field is missing", { ...DRAFT, names: undefined }],
  ["a field is added", { ...DRAFT, sort: "newest" }],
  ["the kind of search is not known", { ...DRAFT, by: "identifier" }],
  ["the product type is not one of Lynkeus", { ...DRAFT, product: "SLC" }],
  ["a level of validation is not known", { ...DRAFT, maturity: ["Validated", "Draft"] }],
  ["a level of validation stands twice", { ...DRAFT, maturity: ["Beta", "Beta"] }],
  ["the levels of validation are a text", { ...DRAFT, maturity: "Beta" }],
  ["the limit to an area is a text", { ...DRAFT, limited: "yes" }],
  ["the area is missing its kind", { ...DRAFT, area: { west: "1", south: "2", east: "3", north: "4" } }],
  ["a side of the area is a number", { ...DRAFT, area: { ...RECTANGLE, west: 22.2 } }],
  ["a side of the area is too long", { ...DRAFT, area: { ...RECTANGLE, west: "2".repeat(41) } }],
  ["the rectangle has another field", { ...DRAFT, area: { ...RECTANGLE, rings: [] } }],
  ["the polygons have no ring", { ...DRAFT, area: { kind: "polygons", rings: [] } }],
  ["a polygon has two points", { ...DRAFT, area: { kind: "polygons", rings: [RING.slice(0, 2)] } }],
  ["a point has three numbers", { ...DRAFT, area: { kind: "polygons", rings: [RING.map((point) => [...point, 0])] } }],
  ["a point lies beyond the pole", { ...DRAFT, area: { kind: "polygons", rings: [RING.map(([x]) => [x, 91])] } }],
  ["a point is a text", { ...DRAFT, area: { kind: "polygons", rings: [RING.map(() => "22.2 36.4")] } }],
  [
    "the polygons are more than a search takes",
    { ...DRAFT, area: { kind: "polygons", rings: Array.from({ length: 11 }, () => RING) } },
  ],
  ["the period is not offered", { ...DRAFT, period: "7-days" }],
  ["a day of the period is not a day", { ...DRAFT, start: "1 January 2026" }],
  ["a day of the period is a number", { ...DRAFT, end: 20260331 }],
  ["the season has a month 13", { ...DRAFT, season: { start: { month: 13, day: 1 }, end: { month: 8, day: 31 } } }],
  [
    "the season has a day 31 of June",
    { ...DRAFT, season: { start: { month: 6, day: 31 }, end: { month: 8, day: 31 } } },
  ],
  ["the season has no end", { ...DRAFT, season: { start: { month: 6, day: 1 } } }],
  ["the season is a text", { ...DRAFT, season: "summer" }],
  ["the choice of a pair is a text", { ...DRAFT, pairInside: "true" }],
  ["the track is a number", { ...DRAFT, track: 12 }],
  ["the frame is too long", { ...DRAFT, frame: "1".repeat(41) }],
  ["the orbit is missing its text", { ...DRAFT, orbit: null }],
  ["the cycle is a list", { ...DRAFT, cycle: ["3"] }],
  ["the direction is not known", { ...DRAFT, direction: "north" }],
  ["a channel is not known", { ...DRAFT, channels: ["HH", "XX"] }],
  ["the side channels are a text", { ...DRAFT, sideChannels: "HH" }],
  ["a band is not known", { ...DRAFT, bands: ["C"] }],
  ["the bandwidth is not offered", { ...DRAFT, bandwidth: 10 }],
  ["the bandwidth is a text", { ...DRAFT, bandwidth: "20" }],
  ["the coverage is not known", { ...DRAFT, coverage: "half" }],
  ["the joint observation is a truth value", { ...DRAFT, joint: true }],
  ["the names are a list", { ...DRAFT, names: ["NISAR_L2_*"] }],
  ["the names are too long", { ...DRAFT, names: "N".repeat(20_001) }],
])("a stored form is refused when %s", (_reason, value) => {
  expect(isSearchDraft(value)).toBe(false);
});
