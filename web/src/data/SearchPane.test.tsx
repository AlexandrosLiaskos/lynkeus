import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { areaStore } from "../shared/area";
import { closeToolPane, dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { EXPLANATIONS } from "./explanations";
import { stopSearch } from "./run";
import { SearchPane } from "./SearchPane";
import {
  clearProducts,
  drawingStore,
  GET_LAYER_PANE,
  productsStore,
  SEARCH_PANE,
  searchDraftStore,
  selectedProductStore,
} from "./state";
import { realProduct, serverWith, someProducts, testMap } from "./testProducts";

function show() {
  render(
    <MapContext value={testMap()}>
      <SearchPane />
    </MapContext>,
  );
  act(() => openToolPane(SEARCH_PANE));
}

function field(name: string | RegExp): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(name);
}

function choice(name: string): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>(name);
}

function sides(): string[] {
  return ["West", "South", "East", "North"].map((name) => field(name).value);
}

async function searchNow(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
}

/** Return the group of choices with a title, which opens and closes. */
function group(title: string): HTMLDetailsElement {
  const element = screen.getByText(title).closest("details");
  if (!element) {
    throw new Error(`The form has no group ${title}.`);
  }
  return element;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T12:00:00Z") });
  areaStore.set(null);
  clearProducts();
  stopSearch();
  searchDraftStore.set(null);
  drawingStore.set(null);
  messagesStore.set([]);
  resetDock();
  resetPanes();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the pane starts with the view of the map, the last 30 days and the validated and provisional products", () => {
  show();
  expect(Number(field("West").value)).toBeCloseTo(-71.4493, 3);
  expect(Number(field("East").value)).toBeCloseTo(-70.3507, 3);
  expect(field("First day").value).toBe("2026-10-15");
  expect(field("Last day").value).toBe("2026-11-14");
  expect(choice("Product type").value).toBe("GCOV");
  expect(choice("Period").value).toBe("30-days");
  expect(["Validated", "Provisional", "Beta"].map((level) => field(level).checked)).toEqual([true, true, false]);
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
});

test("the pane starts with the drawn area when there is one, and keeps its choices when it is opened again", async () => {
  areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  show();
  expect(sides()).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
  await userEvent.click(screen.getByText("Orbit"));
  await userEvent.type(field("Track"), "141");
  act(() => closeToolPane(SEARCH_PANE));
  expect(screen.queryByLabelText("Track")).toBeNull();
  areaStore.set(null);
  act(() => openToolPane(SEARCH_PANE));
  expect(sides()).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
  expect(field("Track").value).toBe("141");
  // The group of a choice that is made is open, so that the choice is seen.
  expect(group("Orbit").open).toBe(true);
  expect(group("Radar").open).toBe(false);
});

test("the common choices stand first and open, and the groups of the orbit and of the radar are closed", () => {
  show();
  for (const name of ["Product type", "Area", "West", "Period", "First day", "Only a season of each year"]) {
    expect(field(name).closest("details")).toBeNull();
  }
  expect([...document.querySelectorAll("details > summary")].map((summary) => summary.textContent)).toEqual([
    "Orbit",
    "Radar",
  ]);
  expect(group("Orbit").open).toBe(false);
  expect(group("Radar").open).toBe(false);
  expect(group("Orbit").contains(field("Track"))).toBe(true);
  expect(group("Radar").contains(field("Coverage of the frame"))).toBe(true);
});

test("a group opens when one of its choices is made elsewhere, and stays open when the choice is taken back", () => {
  show();
  const change = (changes: { track?: string; coverage?: "" | "full" }) =>
    act(() => {
      const draft = searchDraftStore.get();
      searchDraftStore.set(draft && { ...draft, ...changes });
    });
  change({ track: "141" });
  expect(group("Orbit").open).toBe(true);
  expect(group("Radar").open).toBe(false);
  change({ track: "", coverage: "full" });
  expect(group("Orbit").open).toBe(true);
  expect(group("Radar").open).toBe(true);
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("each explanation shows from the button beside its title, and none stands under a field", async () => {
  show();
  expect(explanation(field("Track"))).toBe(EXPLANATIONS.track);
  expect(explanation(field("West"))).toBe(EXPLANATIONS.west);
  expect(explanation(choice("Area"))).toBe(EXPLANATIONS.area);
  expect(explanation(choice("Period"))).toBe(EXPLANATIONS.period);
  expect(explanation(screen.getByRole("group", { name: "Level of validation" }))).toBe(EXPLANATIONS.maturity);
  expect(explanation(field("Cycle"))).toBe(EXPLANATIONS.cycle);
  await userEvent.selectOptions(choice("Product type"), "GUNW");
  expect(explanation(field("Cycle"))).toBe(EXPLANATIONS.pairCycle);
  expect(explanation(screen.getByRole("group", { name: "Pairs of acquisitions" }))).toBe(EXPLANATIONS.pairs);
  for (const title of ["Search products", "Area", "North", "Frame", "Absolute orbit", "Channels"]) {
    expect(screen.getByRole("button", { name: `Information about ${title}` })).toBeDefined();
  }
  expect(document.querySelector(".usa-hint")).toBeNull();
  await userEvent.click(field("Product names"));
  expect(explanation(field("Names"))).toBe(EXPLANATIONS.names);
});

test("wrong choices are named and nothing is sent", async () => {
  const { fetch, asked } = serverWith({ found: 0, products: [] });
  vi.stubGlobal("fetch", fetch);
  show();
  await userEvent.clear(field("West"));
  await searchNow();
  expect(screen.getByRole("alert").textContent).toBe("Give the four sides of the area as numbers.");
  await userEvent.type(field("West"), "-60");
  await userEvent.clear(field("North"));
  await userEvent.type(field("North"), "95");
  await searchNow();
  expect(screen.getByRole("alert").textContent).toMatch(/The area is not valid/);
  expect(asked).toEqual([]);
});

test("a search sends every choice, fills the list and states the number found at the foot of the pane", async () => {
  const { fetch, asked } = serverWith({ found: 1, products: someProducts(1) });
  vi.stubGlobal("fetch", fetch);
  areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  show();
  await userEvent.selectOptions(field("Product type"), "GCOV");
  await userEvent.click(field("Beta"));
  await userEvent.selectOptions(field("Period"), "mission");
  await userEvent.click(field("Only a season of each year"));
  await userEvent.selectOptions(field("Season from: month"), "12");
  await userEvent.selectOptions(field("Season to: month"), "2");
  await userEvent.selectOptions(field("Season to: day"), "28");
  await userEvent.click(screen.getByText("Orbit"));
  await userEvent.type(field("Track"), "141");
  await userEvent.type(field("Frame"), "60-70");
  await userEvent.selectOptions(field("Direction of the orbit"), "descending");
  await userEvent.type(field("Cycle"), "33");
  await userEvent.type(field("Absolute orbit"), "6460-6468");
  await userEvent.click(screen.getByText("Radar"));
  const main = within(screen.getByRole("group", { name: "Channels of the main band (A)" }));
  await userEvent.click(main.getByLabelText("HH"));
  await userEvent.click(main.getByLabelText("HV"));
  await userEvent.click(
    within(screen.getByRole("group", { name: "Channels of the side band (B)" })).getByLabelText("VV"),
  );
  await userEvent.click(within(screen.getByRole("group", { name: "Frequency bands" })).getByLabelText("B"));
  await userEvent.selectOptions(field("Range bandwidth of the main band"), "40");
  await userEvent.selectOptions(field("Coverage of the frame"), "full");
  await userEvent.selectOptions(field("Observed together with the S-band radar"), "no");
  setPaneOpen("catalog", false);
  await searchNow();
  expect(await screen.findByText("1 product was found. The Catalog pane lists it.")).toBeDefined();
  expect(panesStore.get().catalog.open).toBe(true);
  expect(decodeURIComponent(asked[0] ?? "")).toBe(
    "/api/products?product=GCOV&maturity=Validated&maturity=Provisional&maturity=Beta&west=-71.2&south=42.6&east=-70.75&north=42.95" +
      "&start=2025-10-01&end=2026-11-14&season_start=335&season_end=59&track=141&frame=60-70&orbit=6460-6468" +
      "&direction=descending&channel=HH&channel=HV&side_channel=VV&band=B&bandwidth=40&coverage=full&joint=false&cycle=33",
  );
  expect(productsStore.get()?.products.map(({ id }) => id)).toEqual(["G0-ASF"]);
  expect(messagesStore.get()).toEqual([]);
  // The outcome offers the next step.
  await userEvent.click(screen.getByRole("button", { name: "Get layer", hidden: true }));
  expect(dockStore.get().tools).toEqual([SEARCH_PANE, GET_LAYER_PANE]);
  // The test makes some thirty choices, which takes longer than the usual time of a test on a slow machine.
}, 30_000);

test("a day typed in the period makes the period a custom one, and an offered period sets both days", async () => {
  show();
  await userEvent.clear(field("First day"));
  await userEvent.type(field("First day"), "2026-10-01");
  expect(choice("Period").value).toBe("custom");
  await userEvent.selectOptions(field("Period"), "12-days");
  expect([field("First day").value, field("Last day").value]).toEqual(["2026-11-02", "2026-11-14"]);
});

test("the choice between the two ways to find a pair shows only for products made from pairs", async () => {
  const { fetch, asked } = serverWith({ found: 0, products: [] });
  vi.stubGlobal("fetch", fetch);
  show();
  expect(screen.queryByRole("group", { name: "Pairs of acquisitions" })).toBeNull();
  await userEvent.selectOptions(field("Product type"), "GUNW");
  expect(field("Overlapping the period").checked).toBe(true);
  await userEvent.click(field("Inside the period"));
  // A product of pairs has one frequency band, so the form offers no side band for it.
  expect(screen.queryByRole("group", { name: "Channels of the side band (B)" })).toBeNull();
  expect(screen.getByRole("group", { name: "Channels" })).toBeDefined();
  await searchNow();
  await vi.waitFor(() => expect(asked).toHaveLength(1));
  expect(asked[0]).toMatch(/product=GUNW.*&pair=inside/);
});

test("soil moisture products have no choice of bandwidth", async () => {
  show();
  await userEvent.selectOptions(field("Product type"), "SME2");
  expect(screen.queryByLabelText(/Range bandwidth/)).toBeNull();
  expect(screen.getByRole("group", { name: "Channels of the side band (B)" })).toBeDefined();
});

test("a search by product names sends the names and no area or period", async () => {
  const { fetch, asked } = serverWith({ found: 1, products: someProducts(1) });
  vi.stubGlobal("fetch", fetch);
  show();
  await userEvent.click(field("Product names"));
  expect(screen.queryByLabelText("Product type")).toBeNull();
  await searchNow();
  expect(screen.getByRole("alert").textContent).toBe("Give at least one product name.");
  await userEvent.type(field("Names"), "NISAR_L2_PR_GCOV_033_*{Enter}NISAR_L3_PR_SME2_032_141_D_067_*");
  await searchNow();
  await vi.waitFor(() => expect(asked).toHaveLength(1));
  expect(decodeURIComponent(asked[0] ?? "")).toBe(
    "/api/products?maturity=Validated&maturity=Provisional&name=NISAR_L2_PR_GCOV_033_*&name=NISAR_L3_PR_SME2_032_141_D_067_*",
  );
});

test("a failed search shows the words of the server and leaves the pane ready", async () => {
  const words = "NASA's catalogue refused the search: The polygon boundary intersected itself.";
  vi.stubGlobal("fetch", serverWith({ status: 422, detail: words }).fetch);
  show();
  await searchNow();
  expect((await screen.findByRole("alert")).textContent).toBe(words);
  expect(productsStore.get()).toBeNull();
  expect(screen.getByRole("button", { name: "Search" }).hasAttribute("aria-disabled")).toBe(false);
});

test("a search without a product says so at the foot of the pane", async () => {
  vi.stubGlobal("fetch", serverWith({ found: 0, products: [] }).fetch);
  show();
  await searchNow();
  expect(await screen.findByText("No product was found for these choices.")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Get layer" })).toBeNull();
});

test("the Cancel button stops a search that is running", async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", (_address: string, { signal }: { signal: AbortSignal }) => {
    signals.push(signal);
    // The server of the test answers only when the request is abandoned.
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  show();
  await searchNow();
  expect(screen.getByRole("status").textContent).toBe("Searching NASA's catalogue");
  expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(signals[0]?.aborted).toBe(true);
  await vi.waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Search" }).hasAttribute("aria-disabled")).toBe(false);
});

test("the list of the area takes the view of the map, the whole Earth and the outline of the selected product", async () => {
  const { fetch, asked } = serverWith({ found: 0, products: [] });
  vi.stubGlobal("fetch", fetch);
  areaStore.set({ west: 0, south: 0, east: 1, north: 1 });
  show();
  const area = choice("Area");
  expect(area.value).toBe("rectangle");
  expect(screen.getByRole<HTMLOptionElement>("option", { name: "The outline of the selected product" }).disabled).toBe(
    true,
  );
  await userEvent.selectOptions(area, "view");
  expect(Number(field("West").value)).toBeCloseTo(-71.4493, 3);
  // The list names what the area is now, so the same choice can be made again.
  expect(area.value).toBe("rectangle");
  await userEvent.selectOptions(area, "earth");
  expect(area.value).toBe("earth");
  expect(screen.queryByLabelText("West")).toBeNull();
  await searchNow();
  await vi.waitFor(() => expect(asked).toHaveLength(1));
  expect(asked[0]).not.toMatch(/west|polygon/);
  await userEvent.selectOptions(area, "rectangle");
  expect(Number(field("West").value)).toBeCloseTo(-71.4493, 3);

  const results = productsStore.get();
  if (!results) {
    throw new Error("the search of the test left no list");
  }
  act(() => {
    productsStore.set({ ...results, found: 1, products: [realProduct()] });
    selectedProductStore.set(realProduct().id);
  });
  await userEvent.selectOptions(area, "product");
  // The outline has four corners; two of its sides span more than two degrees of longitude and receive a point each.
  expect(area.value).toBe("polygons");
  expect(area.selectedOptions[0]?.textContent).toBe("A polygon of 6 points");
  await searchNow();
  await vi.waitFor(() => expect(asked).toHaveLength(2));
  const polygon = new URLSearchParams((asked[1] ?? "").split("?")[1]).get("polygon")?.split(",") ?? [];
  expect(polygon).toHaveLength(14);
  expect(polygon.slice(0, 4)).toEqual(["-71.70459", "43.98766", "-72.63407", "41.89543"]);
  expect(polygon.slice(-2)).toEqual(["-71.70459", "43.98766"]);
  // The rectangle around the polygon takes its place when the user asks for the four sides.
  await userEvent.selectOptions(area, "rectangle");
  expect(sides()).toEqual(["-72.63407", "41.16476", "-68.7564", "43.98766"]);
});

test("the list of the area starts and ends the drawing of a shape on the map", async () => {
  show();
  const area = choice("Area");
  await userEvent.selectOptions(area, "draw-rectangle");
  expect(drawingStore.get()).toBe("rectangle");
  expect(area.value).toBe("draw-rectangle");
  expect(screen.getByRole("status").textContent).toMatch(/^Press on the map, move the pointer and release\./);
  await userEvent.selectOptions(area, "draw-polygon");
  expect(drawingStore.get()).toBe("polygon");
  expect(screen.getByRole("status").textContent).toMatch(/^Click on the map for each point/);
  // Another choice ends the drawing, and so does the end of the drawing on the map.
  await userEvent.selectOptions(area, "rectangle");
  expect(drawingStore.get()).toBeNull();
  await userEvent.selectOptions(area, "draw-polygon");
  act(() => drawingStore.set(null));
  expect(area.value).toBe("rectangle");
  expect(screen.queryByRole("status")).toBeNull();
});

test("a file gives the area, and a file that cannot be read is named", async () => {
  show();
  const input = field(/^File with the area/);
  const polygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  };
  await userEvent.upload(input, new File([JSON.stringify(polygon)], "area.geojson"));
  await vi.waitFor(() => expect(choice("Area").selectedOptions[0]?.textContent).toBe("A polygon of 4 points"));
  await userEvent.upload(input, new File(["{ not json"], "broken.geojson"));
  expect((await screen.findByRole("alert")).textContent).toBe("The file is not a GeoJSON file.");
  expect(choice("Area").value).toBe("polygons");
  const points = {
    type: "MultiPoint",
    coordinates: [
      [-71.2, 42.6],
      [-70.75, 42.95],
    ],
  };
  await userEvent.upload(input, new File([JSON.stringify(points)], "points.json"));
  expect(
    await screen.findByText("The file holds no polygon. The area is the rectangle around its shapes."),
  ).toBeDefined();
  expect(sides()).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
});

test("the button Restore defaults returns the first choices with the view of the map", async () => {
  areaStore.set({ west: 0, south: 0, east: 1, north: 1 });
  show();
  await userEvent.selectOptions(field("Product type"), "GOFF");
  await userEvent.click(screen.getByText("Orbit"));
  await userEvent.type(field("Track"), "abc");
  await searchNow();
  expect(screen.getByRole("alert")).toBeDefined();
  const restore = screen.getByRole("button", { name: "Restore defaults" });
  // The link stands in the foot of the pane, before the run button.
  expect(restore.closest(".tool-pane-foot")).not.toBeNull();
  expect(restore.className).toContain("usa-button--unstyled");
  expect(restore.closest(".tool-pane-secondary")?.nextElementSibling?.textContent).toBe("Search");
  await userEvent.click(restore);
  expect(group("Orbit").open).toBe(false);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(choice("Product type").value).toBe("GCOV");
  expect(field("Track").value).toBe("");
  expect(Number(field("West").value)).toBeCloseTo(-71.4493, 3);
});
