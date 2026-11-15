// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SAMPLE } from "../header/notice/testLimits";
import { resetServersState } from "../servers/state";
import { LABORATORY, OFFICE, OFFICE_NAME, SERVERS } from "../servers/testServers";
import { areaStore } from "../shared/area";
import { dockStore, frontOf, openToolPane, panesOf, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { Pane } from "../shared/pane/Pane";
import { serversStore, type Servers } from "../shared/servers";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { useStore } from "../shared/store";
import { addWhenReadyStore } from "./follow";
import { cellLimitStore, type RequestProduct, type Ring } from "./getLayer";
import {
  ABOUT,
  GetLayerForm,
  GetLayerPane,
  missingOf,
  productOption,
  productTitle,
  runOf,
  type Needs,
} from "./GetLayerPane";
import { jobsStore, loadJobs, resetJobs } from "./jobs";
import { onSignInEnded } from "./service";
import { resetSession, sessionStore, type Session } from "./session";
import type { Product } from "./products";
import {
  clearProducts,
  GET_LAYER_PANE,
  productsStore,
  SEARCH_PANE,
  searchDraftStore,
  selectedProductStore,
} from "./state";
import { realProduct, someProducts, testMap } from "./testProducts";
import { AREA, HH, product } from "./testRequest";
import { job, layer, standIn, type StandIn } from "./testSession";

let server: StandIn;

beforeEach(() => {
  resetDock();
  resetPanes();
  resetJobs();
  resetSession();
  clearProducts();
  searchDraftStore.set(null);
  areaStore.set(null);
  cellLimitStore.set(null);
  addWhenReadyStore.set(true);
  mapLayersStore.set([]);
  messagesStore.set([]);
  serversStore.set(null);
  resetServersState();
  server = standIn();
});

afterEach(() => {
  resetJobs();
  onSignInEnded(() => undefined);
  vi.unstubAllGlobals();
});

interface Shown {
  found?: readonly Product[];
  products?: readonly RequestProduct[];
  session?: Session["state"];
}

function show({ found = [realProduct()], products = [product()], session = "signed-in" }: Shown = {}) {
  const onSignIn = vi.fn();
  const onSearch = vi.fn();
  const onSelect = vi.fn();
  render(
    <MapContext value={testMap()}>
      <GetLayerForm
        found={found}
        selected={products[0]?.id ?? null}
        products={products}
        session={session}
        onSignIn={onSignIn}
        onSearch={onSearch}
        onSelect={onSelect}
      />
    </MapContext>,
  );
  act(() => openToolPane(GET_LAYER_PANE));
  return { onSignIn, onSearch, onSelect };
}

/** Put a product in the list of the search and select it. */
function select(found = realProduct()) {
  productsStore.set({ search: {} as never, found: 1, products: [found] });
  selectedProductStore.set(found.id);
}

const side = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });
const sides = () => ["West", "South", "East", "North"].map((name) => side(name).value);
const runButton = (name = "Get layer") => screen.getByRole("button", { name });
const isActive = (button: HTMLElement) => button.getAttribute("aria-disabled") !== "true";
const layerBox = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
const areaChoice = () => screen.getByLabelText<HTMLSelectElement>("Area");
const productChoice = () => screen.getByLabelText<HTMLSelectElement>("Product");

/** Return the sentence beside the inactive run button, which states what the tool still lacks. */
const missing = () => document.querySelector(".tool-pane-missing")?.textContent ?? null;

/** Return the rows of the estimate, each as its name and its value. */
function estimateRows(): string[][] {
  const rows = screen.getByRole("group", { name: "Estimate" }).querySelectorAll("dt");
  return [...rows].map((name) => [
    name.querySelector("span")?.textContent ?? "",
    name.nextElementSibling?.textContent ?? "",
  ]);
}

/** What a form holds that can run, for the tests of the sentence about what is missing. */
const COMPLETE: Needs = {
  session: "signed-in",
  found: 1,
  products: 1,
  offered: 3,
  chosen: 1,
  area: true,
  outside: false,
  tooLarge: false,
};

/** Type the area of the tests into the four fields. */
async function typeArea(area = AREA) {
  for (const [name, value] of [
    ["West", area.west],
    ["South", area.south],
    ["East", area.east],
    ["North", area.north],
  ] as const) {
    await userEvent.clear(side(name));
    await userEvent.type(side(name), String(value));
  }
}

test("the pane is not drawn before the button opens it", () => {
  render(
    <GetLayerForm
      found={[]}
      selected={null}
      products={[]}
      session="signed-in"
      onSignIn={vi.fn()}
      onSearch={vi.fn()}
      onSelect={vi.fn()}
    />,
    { wrapper: ({ children }) => <MapContext value={testMap()}>{children}</MapContext> },
  );
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the pane names the product and offers its layers, none chosen", () => {
  show();
  expect(screen.getByRole("complementary", { name: "Get layer" })).toBeDefined();
  expect(productChoice().value).toBe(product().id);
  expect(productChoice().selectedOptions[0]?.textContent).toBe("21 Oct 2026, track 141, frame 67, descending");
  const group = screen.getByRole("group", { name: "Layers" });
  expect(
    within(group)
      .getAllByRole<HTMLInputElement>("checkbox")
      .map((box) => box.checked),
  ).toEqual([false, false, false]);
  expect(layerBox("Backscatter HH")).toBeDefined();
  expect(layerBox("Mask of valid samples")).toBeDefined();
  expect(missing()).toBe("Choose a layer.");
  expect(isActive(runButton())).toBe(false);
  expect(runButton().getAttribute("aria-describedby")).toBe(document.querySelector(".tool-pane-missing")?.id);
});

test("a product is named by its type, its dates, its track and its frame", () => {
  expect(productTitle(product())).toBe("GCOV, 21 Oct 2026, track 141, frame 67");
  expect(productTitle(product({ product: "GUNW", dates: ["2026-10-09", "2026-10-21"] }))).toBe(
    "GUNW, 9 Oct 2026 and 21 Oct 2026, track 141, frame 67",
  );
});

test("a product is named in the list of the field Product by its dates, track, frame and direction", () => {
  expect(productOption(realProduct(), false)).toBe("21 Oct 2026, track 141, frame 67, descending");
  expect(productOption({ ...realProduct(), product: "GUNW", dates: ["2026-10-09", "2026-10-21"] }, true)).toBe(
    "GUNW, 9 Oct 2026 and 21 Oct 2026, track 141, frame 67, descending",
  );
});

test("before a search has found a product the pane says so and offers the button Search products", async () => {
  const { onSearch } = show({ found: [], products: [] });
  expect(screen.getByText("No product is selected")).toBeDefined();
  expect(
    screen.getByText("A layer is requested from a product that a search of NASA's catalogue has found."),
  ).toBeDefined();
  expect(screen.queryByLabelText("Product")).toBeNull();
  expect(screen.queryByLabelText("Area")).toBeNull();
  expect(missing()).toBe("Search for products.");
  expect(isActive(runButton())).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Search products" }));
  expect(onSearch).toHaveBeenCalledTimes(1);
});

test("the field Product lists the products found, and a choice selects the product", async () => {
  const found = someProducts(3);
  const { onSelect } = show({ found, products: [] });
  expect([...productChoice().options].map((option) => option.textContent)).toEqual([
    "Select a product",
    ...found.map((other) => productOption(other, false)),
  ]);
  expect(productChoice().options[2]?.textContent).toBe("9 Oct 2026, track 141, frame 67, descending");
  expect(productChoice().value).toBe("");
  expect(screen.queryByRole("checkbox", { name: /Backscatter/ })).toBeNull();
  expect(missing()).toBe("Select a product.");
  expect(isActive(runButton())).toBe(false);
  await userEvent.selectOptions(productChoice(), "G1-ASF");
  expect(onSelect).toHaveBeenCalledWith("G1-ASF");
});

test("the list of the field Product names the type when the products are of several types", () => {
  const [first, second] = someProducts(2);
  if (!first || !second) {
    throw new Error("the test has no products");
  }
  show({ found: [first, { ...second, product: "GUNW" }], products: [] });
  expect([...productChoice().options].map((option) => option.textContent)).toEqual([
    "Select a product",
    "GCOV, 21 Oct 2026, track 141, frame 67, descending",
    "GUNW, 9 Oct 2026, track 141, frame 67, descending",
  ]);
});

test("the foot states the first thing that is missing, in the order in which the visitor provides them", () => {
  expect(missingOf(COMPLETE)).toBeNull();
  const lacking: Needs = {
    session: "signed-out",
    found: 0,
    products: 0,
    offered: 0,
    chosen: 0,
    area: false,
    outside: true,
    tooLarge: true,
  };
  const steps: [Partial<Needs>, string][] = [
    [{ session: "unknown" }, "The sign-in to Earthdata is being checked."],
    [{ session: "unreachable" }, "The sign-in to Earthdata is not known."],
    [{ session: "signed-out" }, "Sign in to Earthdata."],
    [{ session: "signed-in" }, "Search for products."],
    [{ found: 2 }, "Select a product."],
    [{ products: 1 }, "Select a product of which Lynkeus receives a layer."],
    [{ offered: 3 }, "Choose a layer."],
    [{ chosen: 1 }, "Give the area."],
    [{ area: true }, "Choose an area inside the outline of the product."],
    [{ outside: false }, "Choose a smaller area."],
  ];
  let needs = lacking;
  for (const [change, sentence] of steps) {
    needs = { ...needs, ...change };
    expect(missingOf(needs)).toBe(sentence);
  }
  expect(missingOf({ ...needs, tooLarge: false })).toBeNull();
});

test("a product of which Lynkeus receives no layer says so", () => {
  show({ products: [product({ layers: [] })] });
  expect(screen.getByText("Lynkeus receives no layer of this product.")).toBeDefined();
  expect(missing()).toBe("Select a product of which Lynkeus receives a layer.");
});

test("a visitor who is not signed in is told so and offered the form of Sign in", async () => {
  const { onSignIn } = show({ session: "signed-out" });
  expect(
    screen.getByText("You are not signed in to Earthdata. A layer is requested from NASA with your Earthdata account."),
  ).toBeDefined();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(missing()).toBe("Sign in to Earthdata.");
  expect(isActive(runButton())).toBe(false);
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

test("while the server has not said whether the visitor is signed in, the pane says that it is checking", () => {
  show({ session: "unknown" });
  expect(screen.getByText("Checking whether you are signed in to Earthdata.")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  expect(missing()).toBe("The sign-in to Earthdata is being checked.");
  expect(isActive(runButton())).toBe(false);
});

test("the server that does not answer is named, and the pane of Sign in is offered", async () => {
  const { onSignIn } = show({ session: "unreachable" });
  expect(
    screen.getByText(
      "The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata.",
    ),
  ).toBeDefined();
  expect(isActive(runButton())).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

test("each explanation stands behind the button beside its title, and none stands under a title", async () => {
  show();
  expect(document.querySelector(".usa-hint")).toBeNull();
  const tool = screen.getByRole("button", { name: "Information about Get layer" });
  expect(document.getElementById(tool.getAttribute("aria-describedby") ?? "")?.textContent).toBe(ABOUT.tool);
  const described = (element: HTMLElement) =>
    document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
  expect(described(productChoice())).toBe(ABOUT.product);
  expect(described(screen.getByRole("group", { name: "Layers" }))).toBe(ABOUT.layers);
  expect(described(areaChoice())).toBe(ABOUT.area);
  expect(described(screen.getByRole("group", { name: "Estimate" }))).toBe(ABOUT.estimate);
  for (const title of ["Product", "Layers", "Area", "Estimate"]) {
    expect(screen.getByRole("button", { name: `Information about ${title}` })).toBeDefined();
  }
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(document.querySelector(".usa-hint")).toBeNull();
  expect(document.querySelector(".tool-pane-body > p")).toBeNull();
});

test("the area starts as the area of the search starts: with the view of the map", () => {
  show();
  expect(Number(side("West").value)).toBeCloseTo(-71.4493, 3);
  expect(Number(side("East").value)).toBeCloseTo(-70.3507, 3);
  expect(areaChoice().value).toBe("rectangle");
  expect(estimateRows()).toEqual([["Surface", expect.stringMatching(/^[\d,]+ km²$/)]]);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the area starts as the area of the Map tab when there is one", () => {
  areaStore.set(AREA);
  show();
  expect(sides()).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
  expect(estimateRows()).toEqual([["Surface", "1,429 km²"]]);
});

test("the area is the one of the search, in both directions", async () => {
  areaStore.set(AREA);
  show();
  await userEvent.clear(side("North"));
  await userEvent.type(side("North"), "43");
  expect(searchDraftStore.get()?.area).toEqual({
    kind: "rectangle",
    west: "-71.2",
    south: "42.6",
    east: "-70.75",
    north: "43",
  });
  const draft = searchDraftStore.get();
  act(() =>
    searchDraftStore.set(
      draft && { ...draft, area: { kind: "rectangle", west: "-71", south: "42", east: "-70", north: "43" } },
    ),
  );
  expect(sides()).toEqual(["-71", "42", "-70", "43"]);
});

test("an area of polygons gives the rectangle around them, and the outline of the product lies inside itself", async () => {
  select();
  show();
  await userEvent.selectOptions(areaChoice(), "product");
  expect(searchDraftStore.get()?.area.kind).toBe("polygons");
  expect(estimateRows()).toEqual([
    ["Rectangle", "West -72.63407, south 41.16476, east -68.7564, north 43.98766 (degrees)"],
    ["Surface", "99,654 km²"],
  ]);
  expect(screen.getByRole("button", { name: "Information about Rectangle" })).toBeDefined();
  expect(screen.getByText(ABOUT.rectangle)).toBeDefined();
  expect(screen.queryByText(/lies outside the outline/)).toBeNull();
});

test("an area of polygons is compared with the outline of the product by its polygons", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  const takePolygons = (rings: Ring[]) => {
    const draft = searchDraftStore.get();
    act(() => searchDraftStore.set(draft && { ...draft, limited: true, area: { kind: "polygons", rings } }));
  };
  // A triangle inside the slanted outline, although the rectangle around it reaches west of the outline.
  takePolygons([
    [
      [-72.1, 43],
      [-71.95, 42.8],
      [-71.8, 43.3],
      [-72.1, 43],
    ],
  ]);
  expect(screen.queryByText(/lies outside the outline/)).toBeNull();
  expect(isActive(runButton())).toBe(true);
  // The first corner of this triangle lies west of the outline.
  takePolygons([
    [
      [-72.3, 43],
      [-71.95, 42.8],
      [-71.8, 43.3],
      [-72.3, 43],
    ],
  ]);
  expect(screen.getByText("A part of the area lies outside the outline of the product.")).toBeDefined();
  expect(isActive(runButton())).toBe(true);
  // A triangle beside the south-west corner of the outline, whose rectangle holds that corner.
  takePolygons([
    [
      [-72.75, 42],
      [-72.75, 41.75],
      [-72.5, 41.75],
      [-72.75, 42],
    ],
  ]);
  expect(screen.getByRole("alert").textContent).toBe("The area lies outside the outline of the product.");
  expect(missing()).toBe("Choose an area inside the outline of the product.");
  expect(isActive(runButton())).toBe(false);
});

test("no layer is received for the whole Earth", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await userEvent.selectOptions(areaChoice(), "earth");
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toBe("A layer is not received for the whole Earth. Choose an area.");
  expect(areaChoice().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  expect(missing()).toBe("Give the area.");
  expect(screen.queryByRole("group", { name: "Estimate" })).toBeNull();
  expect(isActive(runButton())).toBe(false);
});

test("a wrong area is named and nothing is sent", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea({ ...AREA, west: -70 });
  expect(screen.getByRole("alert").textContent).toBe(
    "A layer is not received for an area that crosses the meridian of 180 degrees. Choose an area on one side of it.",
  );
  expect(missing()).toBe("Give the area.");
  await typeArea({ ...AREA, north: 91 });
  expect(screen.getByRole("alert").textContent).toMatch(/^The area is not valid\./);
  await userEvent.clear(side("South"));
  expect(screen.getByRole("alert").textContent).toBe("Give the four sides of the area as numbers.");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("an area outside the product is refused before anything is sent", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea({ west: -60, south: 42.6, east: -59, north: 42.95 });
  expect(screen.getByRole("alert").textContent).toBe("The area lies outside the outline of the product.");
  expect(missing()).toBe("Choose an area inside the outline of the product.");
  expect(isActive(runButton())).toBe(false);
  await typeArea();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(isActive(runButton())).toBe(true);
});

test("the estimate states the cells and the size of each chosen layer that has a cell size", async () => {
  show();
  await typeArea();
  expect(estimateRows()).toEqual([["Surface", "1,429 km²"]]);
  await userEvent.click(layerBox("Backscatter HH"));
  await userEvent.click(layerBox("Mask of valid samples"));
  expect(estimateRows()).toEqual([
    ["Surface", "1,429 km²"],
    ["Backscatter HH", "Up to 14 million cells, 57 MB"],
  ]);
  expect(missing()).toBeNull();
  expect(isActive(runButton("Get 2 layers"))).toBe(true);
});

test("a layer above the limit of the server is refused in the form", async () => {
  server.process = {
    id: GET_LAYER_PANE,
    additionalParameters: { parameters: [{ name: "most-cells", value: [10_000_000] }] },
  };
  show();
  await vi.waitFor(() => expect(cellLimitStore.get()).toBe(10_000_000));
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(screen.getByRole("alert").textContent).toBe(
    'The area is too large for the layer "Backscatter HH": the layer would have about 14 million cells, and Lynkeus receives at most 10 million. Choose a smaller area.',
  );
  expect(missing()).toBe("Choose a smaller area.");
  expect(isActive(runButton())).toBe(false);
  await typeArea({ ...AREA, north: 42.7 });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(isActive(runButton())).toBe(true);
});

test("a request starts one job, and the foot shows its progress and its outcome", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(missing()).toBeNull();
  await userEvent.click(runButton());
  expect(await screen.findByText("Waiting. The job waits for its turn. (0 %)")).toBeDefined();
  expect(server.sent("POST")).toEqual([
    {
      method: "POST",
      address: "/api/processes/get-layer/execution",
      content: { inputs: { product: "GCOV", granule: product().name, layer: "HHHH", area: AREA } },
    },
  ]);
  expect(isActive(runButton())).toBe(false);

  server.change("job-1", { status: "running", progress: 40, message: "NASA Harmony is preparing the layer." });
  await act(() => loadJobs());
  expect(screen.getByText("Running. NASA Harmony is preparing the layer. (40 %)")).toBeDefined();
  expect(screen.getByRole<HTMLProgressElement>("progressbar", { name: "Progress of Get layer" }).value).toBe(0.4);

  server.change("job-1", {
    status: "successful",
    progress: 100,
    message: "The layer is ready.",
    finished: "2026-11-14T16:25:00Z",
    layer: "made",
  });
  await act(() => loadJobs());
  expect(screen.getByText("The layer was received. The section Layers of the Catalog pane lists it.")).toBeDefined();
  act(() => mapLayersStore.set([layer({ id: "made" })]));
  expect(
    screen.getByText("The layer was received. It is on the map and in the section Layers of the Catalog pane."),
  ).toBeDefined();
  expect(isActive(runButton())).toBe(true);
  expect(screen.getByRole("button", { name: "Show the Catalog pane" })).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "View details" }));
  const details = screen.getByRole("dialog", { name: "Get layer: details" });
  expect(within(details).getByRole("row", { name: "Status Finished" })).toBeDefined();
  expect(within(details).getByRole("row", { name: "Layer of the product HHHH" })).toBeDefined();
});

test("each layer of each product is one job", async () => {
  const second = product({ id: "second", name: "NISAR_SECOND", dates: ["2026-11-02"], layers: [HH] });
  show({ products: [product(), second] });
  const groups = screen.getAllByRole("group", { name: /^Layers of GCOV/ });
  expect(groups).toHaveLength(2);
  await userEvent.click(within(groups[0] as HTMLElement).getByRole("checkbox", { name: "Backscatter HH" }));
  await userEvent.click(layerBox("Backscatter HV"));
  await userEvent.click(within(groups[1] as HTMLElement).getByRole("checkbox", { name: "Backscatter HH" }));
  await typeArea();
  expect(estimateRows()).toContainEqual([
    "Backscatter HH, GCOV, 2 Nov 2026, track 141, frame 67",
    "Up to 14 million cells, 57 MB",
  ]);
  await userEvent.click(runButton("Get 3 layers"));
  expect(await screen.findByText("0 of 3 jobs have ended (0 %)")).toBeDefined();
  expect(
    server.sent("POST").map(({ content }) => (content as { inputs: { granule: string; layer: string } }).inputs),
  ).toMatchObject([
    { granule: product().name, layer: "HHHH" },
    { granule: product().name, layer: "HVHV" },
    { granule: "NISAR_SECOND", layer: "HHHH" },
  ]);
  server.change("job-1", { status: "successful", progress: 100 });
  server.change("job-2", { status: "running", progress: 50 });
  await act(() => loadJobs());
  expect(screen.getByText("1 of 3 jobs have ended (50 %)")).toBeDefined();
  server.change("job-2", { status: "failed", message: "NASA Harmony refused the request." });
  server.change("job-3", { status: "successful", progress: 100 });
  await act(() => loadJobs());
  expect(screen.getByText("2 of 3 layers were received. 1 job failed.")).toBeDefined();
});

test("the form stays in front when the Catalog pane appears with the first job", async () => {
  function Catalog() {
    return useStore(jobsStore).length > 0 ? (
      <Pane id="catalog" title="Catalog">
        Jobs
      </Pane>
    ) : null;
  }
  setPaneOpen("catalog", true);
  show();
  render(<Catalog />);
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  await screen.findByText("Waiting. The job waits for its turn. (0 %)");
  expect(panesOf(dockStore.get(), "right").map(({ id }) => id)).toEqual([GET_LAYER_PANE, "catalog"]);
  expect(frontOf(dockStore.get(), "right")).toBe(GET_LAYER_PANE);
});

test("a limit of the server is stated in its words", async () => {
  server.refuse(
    "POST",
    "/api/processes",
    429,
    "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish.",
  );
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  expect((await screen.findByRole("alert")).textContent).toBe(
    "You have 4 jobs that wait or run, which is the most allowed. Wait for one to finish.",
  );
  expect(jobsStore.get()).toEqual([]);
  expect(isActive(runButton())).toBe(true);
});

test("a limit that is met after some jobs were started says how many were started", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await userEvent.click(layerBox("Backscatter HV"));
  await userEvent.click(layerBox("Mask of valid samples"));
  await typeArea();
  server.refuse("POST", "/api/processes", 507, "A session holds at most 50 layers. Remove a layer and try again.", 1);
  await userEvent.click(runButton("Get 3 layers"));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "1 of 3 jobs were started. A session holds at most 50 layers. Remove a layer and try again.",
  );
  expect(jobsStore.get()).toHaveLength(1);
  expect(screen.getByText("Waiting. The job waits for its turn. (0 %)")).toBeDefined();
});

test("the answer 401 records the end of the sign-in and is shown in the words of the server", async () => {
  const ended = vi.fn();
  onSignInEnded(ended);
  server.refuse("POST", "/api/processes", 401, "Sign in to Earthdata to start this job.");
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  expect((await screen.findByRole("alert")).textContent).toBe("Sign in to Earthdata to start this job.");
  expect(ended).toHaveBeenCalledTimes(1);
});

test("the Cancel button ends the jobs that the form started", async () => {
  server.jobs = [job({ jobID: "other" })];
  await loadJobs();
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  await screen.findByText("Waiting. The job waits for its turn. (0 %)");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("The job was cancelled.")).toBeDefined();
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual(["/api/jobs/job-1"]);
  expect(jobsStore.get().map(({ jobID }) => jobID)).toEqual(["other"]);
});

test("a failed job is shown in the words of the server", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  await screen.findByText("Waiting. The job waits for its turn. (0 %)");
  server.change("job-1", { status: "failed", message: "NASA Harmony did not answer in time." });
  await act(() => loadJobs());
  expect(screen.getByRole("alert").textContent).toBe("NASA Harmony did not answer in time.");
});

test("the outcome follows the jobs of the last request", () => {
  const started = { ids: ["a", "b"], sending: null, fault: null, cancelled: false };
  expect(runOf(null, [])).toBeNull();
  expect(runOf({ ...started, ids: [], sending: 2 }, [])).toEqual({ state: "running", text: "Starting 2 jobs" });
  expect(runOf({ ...started, ids: [], sending: 1 }, [])).toEqual({ state: "running", text: "Starting the job" });
  expect(runOf({ ...started, ids: [] }, [])).toBeNull();
  expect(runOf(started, [])).toEqual({ state: "warning", text: "The jobs are no longer in the list of jobs." });
  expect(runOf({ ...started, ids: ["a"] }, [])).toEqual({
    state: "warning",
    text: "The job is no longer in the list of jobs.",
  });
  expect(runOf({ ...started, cancelled: true }, [])).toEqual({ state: "warning", text: "The jobs were cancelled." });
  const done = (jobID: string) => job({ jobID, status: "successful", progress: 100 });
  const failed = (jobID: string) => job({ jobID, status: "failed", message: "Refused." });
  expect(runOf(started, [done("a"), done("b")])).toMatchObject({
    state: "success",
    text: "2 layers were received. The section Layers of the Catalog pane lists them.",
    action: { label: "Show the Catalog pane" },
  });
  // The link of the outcome brings the Catalog pane to the front.
  const outcome = runOf(started, [done("a"), done("b")]);
  setPaneOpen("catalog", false);
  if (outcome?.state === "success") {
    outcome.action?.onClick();
  }
  expect(panesStore.get().catalog.open).toBe(true);
  const made = (jobID: string) => ({ ...done(jobID), layer: `layer-${jobID}` });
  expect(runOf(started, [made("a"), made("b")], new Set(["layer-a"]))).toMatchObject({
    text: "2 layers were received. The section Layers of the Catalog pane lists them.",
  });
  expect(runOf(started, [made("a"), made("b")], new Set(["layer-a", "layer-b"]))).toMatchObject({
    text: "2 layers were received. They are on the map and in the section Layers of the Catalog pane.",
  });
  expect(runOf(started, [failed("a"), failed("b")])).toMatchObject({ state: "error", text: "All 2 jobs failed." });
  expect(runOf(started, [failed("a"), failed("b")])).not.toHaveProperty("action");
  expect(runOf(started, [done("a"), failed("b")])).toMatchObject({
    state: "warning",
    text: "1 of 2 layers were received. 1 job failed.",
    action: { label: "Show the Catalog pane" },
  });
  expect(runOf({ ...started, ids: ["a", "b", "c"] }, [done("a")])).toMatchObject({
    state: "warning",
    text: "1 of 3 layers were received. 2 jobs are no longer in the list of jobs.",
  });
});

test("the visitor chooses whether a layer goes on the map when it is ready", async () => {
  show();
  const box = layerBox("Add to the map when ready");
  expect(box.checked).toBe(true);
  await userEvent.click(box);
  expect(addWhenReadyStore.get()).toBe(false);
  expect(box.checked).toBe(false);
});

test("the form is used with the keyboard alone", async () => {
  areaStore.set(AREA);
  show();
  layerBox("Backscatter HH").focus();
  await userEvent.keyboard(" ");
  expect(layerBox("Backscatter HH").checked).toBe(true);
  await userEvent.tab();
  expect(document.activeElement).toBe(layerBox("Backscatter HV"));
  side("West").focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByText("Waiting. The job waits for its turn. (0 %)")).toBeDefined();
  expect(server.sent("POST")).toHaveLength(1);
});

test("the pane offers the layers of the product that is selected in the list of the search", () => {
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(
    <MapContext value={testMap()}>
      <GetLayerPane />
    </MapContext>,
  );
  act(() => openToolPane(GET_LAYER_PANE));
  expect(screen.getByText("No product is selected")).toBeDefined();
  act(() => select());
  expect(productChoice().value).toBe(realProduct().id);
  const group = screen.getByRole("group", { name: "Layers" });
  expect(
    within(group)
      .getAllByRole("checkbox")
      .map((box) => box.nextSibling?.textContent),
  ).toEqual(realProduct().layers.map(({ title }) => title));
  expect(screen.queryByText(/signed in to Earthdata/)).toBeNull();
  act(() => selectedProductStore.set(null));
  expect(productChoice().value).toBe("");
  expect(screen.queryByRole("group", { name: "Layers" })).toBeNull();
  expect(missing()).toBe("Select a product.");
});

test("the field Product selects the product for the Catalog pane and the map as well", async () => {
  sessionStore.set({ state: "signed-in", user: "a_user" });
  productsStore.set({ search: {} as never, found: 2, products: someProducts(2) });
  render(
    <MapContext value={testMap()}>
      <GetLayerPane />
    </MapContext>,
  );
  act(() => openToolPane(GET_LAYER_PANE));
  await userEvent.selectOptions(productChoice(), "G1-ASF");
  expect(selectedProductStore.get()).toBe("G1-ASF");
  expect(productChoice().value).toBe("G1-ASF");
  expect(screen.getByRole("group", { name: "Layers" })).toBeDefined();
  act(() => selectedProductStore.set("G0-ASF"));
  expect(productChoice().value).toBe("G0-ASF");
});

test("the button Search products of the empty pane opens the pane of the search", async () => {
  sessionStore.set({ state: "signed-in", user: "a_user" });
  render(
    <MapContext value={testMap()}>
      <GetLayerPane />
    </MapContext>,
  );
  act(() => openToolPane(GET_LAYER_PANE));
  await userEvent.click(screen.getByRole("button", { name: "Search products" }));
  expect(dockStore.get().tools).toEqual([GET_LAYER_PANE, SEARCH_PANE]);
  expect(dockStore.get().front.right).toBe(SEARCH_PANE);
});

test("the pane follows the sign-in, and its button Sign in opens the pane of the sign-in", async () => {
  render(
    <MapContext value={testMap()}>
      <GetLayerPane />
    </MapContext>,
  );
  act(() => openToolPane(GET_LAYER_PANE));
  expect(screen.getByText("Checking whether you are signed in to Earthdata.")).toBeDefined();
  act(() => sessionStore.set({ state: "signed-out" }));
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(dockStore.get().tools).toEqual([GET_LAYER_PANE, "sign-in"]);
  expect(dockStore.get().front.right).toBe("sign-in");
  act(() => sessionStore.set({ state: "signed-in", user: "a_user" }));
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
});

const serverChoice = () => screen.getByLabelText<HTMLSelectElement>("Server");
const serverRows = () =>
  [...document.querySelectorAll(".server-choice .property-row")].map(
    (row) =>
      `${row.querySelector(".property-name")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );

/** Give the visitor the own servers of the examples, as the project server lists them. */
function withServers() {
  server.servers = SERVERS;
  server.limits = SAMPLE;
  serversStore.set(SERVERS);
}

test("a visitor without an own server has no field Server, and the job names no server", async () => {
  show();
  expect(screen.queryByLabelText("Server")).toBeNull();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]?.address).toBe("/api/processes/get-layer/execution");
});

test("a visitor with an own server chooses the server, Automatic at first, and the job names no server", async () => {
  withServers();
  show();
  expect(serverChoice().value).toBe("automatic");
  expect(serverRows()[0]).toBe("At present: Office computer");
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(missing()).toBeNull();
  await userEvent.click(runButton());
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]?.address).toBe("/api/processes/get-layer/execution");
});

test("the job is started on the server that the visitor chose, and the limits shown are those of that server", async () => {
  withServers();
  show();
  await userEvent.selectOptions(serverChoice(), OFFICE.id);
  expect(serverRows()).toEqual([
    "Jobs at the same time: 4 (1 running, 2 waiting)",
    "Largest layer: 10 GB",
    "Most cells of a layer: 100 million",
    "Space for layers: 1.3 GB of 100 GB used",
    "Free disk space: 412 GB",
  ]);
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]?.address).toBe(`/api/processes/get-layer/execution?server=${OFFICE.id}`);
  expect(jobsStore.get()[0]?.server).toEqual(OFFICE_NAME);
});

test("the choice of the project server shows the limits of the project server and is sent with the job", async () => {
  withServers();
  show();
  await userEvent.selectOptions(serverChoice(), "project");
  await vi.waitFor(() =>
    expect(serverRows()).toEqual([
      "Jobs at the same time: 2 for all visitors",
      "Largest layer: 500 MB",
      "Most cells of a layer: 25 million",
      "Space for layers: 2 GB and 50 layers for one session",
    ]),
  );
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  await vi.waitFor(() => expect(server.sent("POST")).toHaveLength(1));
  expect(server.sent("POST")[0]?.address).toBe("/api/processes/get-layer/execution?server=project");
  expect(jobsStore.get()[0]?.server).toBeNull();
});

test("a chosen server that is not connected is the last thing that the foot names, and nothing is sent", async () => {
  withServers();
  show();
  await userEvent.selectOptions(serverChoice(), LABORATORY.id);
  expect(missing()).toBe("Choose a layer.");
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(missing()).toBe('Choose a server that is connected: "Laboratory server" is not.');
  expect(isActive(runButton())).toBe(false);
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
  expect(
    screen.getByText(
      'The server "Laboratory server" is not connected. Start Lynkeus Server on that computer, or choose another server.',
    ),
  ).toBeDefined();
});

/** Give the project server a limit of 10 million cells, under the 14 million of the layer of the test area. */
function withProjectLimit() {
  server.process = {
    id: GET_LAYER_PANE,
    additionalParameters: { parameters: [{ name: "most-cells", value: [10_000_000] }] },
  };
}

/** The servers of the examples, the first with another limit on the cells of a layer. */
function serversWith(cells: number): Servers {
  const [office, ...others] = SERVERS.servers;
  if (!office?.state) {
    throw new Error("The first server of the example reports its state.");
  }
  const limits = { ...office.state.limits, layer_cells: cells };
  return { ...SERVERS, servers: [{ ...office, state: { ...office.state, limits } }, ...others] };
}

test("the area is checked against the limit of the server that Automatic names, and not of the project server", async () => {
  withProjectLimit();
  withServers();
  show();
  await vi.waitFor(() => expect(cellLimitStore.get()).toBe(10_000_000));
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  // Automatic names the Office computer, which receives 100 million cells: the 14 million of the layer pass.
  expect(serverRows()[0]).toBe("At present: Office computer");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(missing()).toBeNull();
  expect(isActive(runButton())).toBe(true);
});

test("on the project server the area is refused with the limit of the project server, and the server of the visitor that receives more is named", async () => {
  withProjectLimit();
  withServers();
  show();
  await vi.waitFor(() => expect(cellLimitStore.get()).toBe(10_000_000));
  await userEvent.selectOptions(serverChoice(), "project");
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(screen.getByRole("alert").textContent).toBe(
    'The area is too large for the layer "Backscatter HH" on the project server: the layer would have about 14 million cells, and the project server receives at most 10 million. Choose a smaller area, or your server "Office computer", which receives at most 100 million.',
  );
  expect(missing()).toBe("Choose a smaller area.");
  expect(isActive(runButton())).toBe(false);
  await userEvent.selectOptions(serverChoice(), OFFICE.id);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(isActive(runButton())).toBe(true);
});

test("on a server of the visitor the area is refused with the name and the limit of that server", async () => {
  const servers = serversWith(12_000_000);
  server.servers = servers;
  server.limits = SAMPLE;
  serversStore.set(servers);
  show();
  await userEvent.selectOptions(serverChoice(), OFFICE.id);
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(screen.getByRole("alert").textContent).toBe(
    'The area is too large for the layer "Backscatter HH" on your server "Office computer": the layer would have about 14 million cells, and that server receives at most 12 million. Choose a smaller area.',
  );
  expect(serverRows()).toContain("Most cells of a layer: 12 million");
  expect(isActive(runButton())).toBe(false);
  expect(server.sent("POST")).toEqual([]);
});

test("an execution that the server refuses is stated in the words of the server", async () => {
  withServers();
  const sentence = 'The server "Office computer" is not connected, so the job cannot run there now.';
  server.refuse("POST", "/api/processes", 422, sentence);
  show();
  await userEvent.selectOptions(serverChoice(), OFFICE.id);
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  await userEvent.click(runButton());
  expect((await screen.findByRole("alert")).textContent).toBe(sentence);
  expect(jobsStore.get()).toEqual([]);
});
