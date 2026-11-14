import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { areaStore } from "../shared/area";
import { dockStore, frontOf, openToolPane, panesOf, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { Pane } from "../shared/pane/Pane";
import { resetPanes, setPaneOpen } from "../shared/panes";
import { useStore } from "../shared/store";
import { addWhenReadyStore } from "./follow";
import { cellLimitStore, type RequestProduct } from "./getLayer";
import { GET_LAYER, GetLayerPane, productTitle, runOf } from "./GetLayerPane";
import { jobsStore, loadJobs, resetJobs } from "./jobs";
import { onSignInEnded } from "./service";
import { AREA, HH, product } from "./testRequest";
import { job, standIn, type StandIn } from "./testSession";

let server: StandIn;

beforeEach(() => {
  resetDock();
  resetPanes();
  resetJobs();
  areaStore.set(null);
  cellLimitStore.set(null);
  addWhenReadyStore.set(true);
  messagesStore.set([]);
  server = standIn();
});

afterEach(() => {
  resetJobs();
  onSignInEnded(() => undefined);
  vi.unstubAllGlobals();
});

interface Shown {
  products?: readonly RequestProduct[];
  signedIn?: boolean | null;
}

function show({ products = [product()], signedIn = true }: Shown = {}) {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
  map.setSize([800, 600]);
  const onSignIn = vi.fn();
  render(
    <MapContext value={map}>
      <GetLayerPane products={products} signedIn={signedIn} onSignIn={onSignIn} />
    </MapContext>,
  );
  act(() => openToolPane(GET_LAYER));
  return { onSignIn };
}

const side = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });
const sides = () => ["West", "South", "East", "North"].map((name) => side(name).value);
const runButton = (name = "Get layer") => screen.getByRole("button", { name });
const isActive = (button: HTMLElement) => button.getAttribute("aria-disabled") !== "true";
const layerBox = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });

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
  render(<GetLayerPane products={[]} signedIn onSignIn={vi.fn()} />, {
    wrapper: ({ children }) => <MapContext value={new OlMap({})}>{children}</MapContext>,
  });
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the pane names the product and offers its layers, none chosen", () => {
  show();
  expect(screen.getByRole("complementary", { name: "Get layer" })).toBeDefined();
  const group = screen.getByRole("group", { name: "Layers of GCOV, 21 Oct 2026, track 141, frame 67" });
  expect(
    within(group)
      .getAllByRole<HTMLInputElement>("checkbox")
      .map((box) => box.checked),
  ).toEqual([false, false, false]);
  expect(layerBox("Backscatter HH")).toBeDefined();
  expect(layerBox("Mask of valid samples")).toBeDefined();
  expect(screen.getByText("No layer is chosen.")).toBeDefined();
  expect(isActive(runButton())).toBe(false);
});

test("a product is named by its type, its dates, its track and its frame", () => {
  expect(productTitle(product())).toBe("GCOV, 21 Oct 2026, track 141, frame 67");
  expect(productTitle(product({ product: "GUNW", dates: ["2026-10-09", "2026-10-21"] }))).toBe(
    "GUNW, 9 Oct 2026 and 21 Oct 2026, track 141, frame 67",
  );
});

test("without a selected product the pane says where to select one", () => {
  show({ products: [] });
  expect(screen.getByText(/No product is selected\. Select a product in the list Products found/)).toBeDefined();
  expect(screen.queryByRole("checkbox", { name: /Backscatter/ })).toBeNull();
  expect(isActive(runButton())).toBe(false);
});

test("a product of which Lynkeus receives no layer says so", () => {
  show({ products: [product({ layers: [] })] });
  expect(screen.getByText("Lynkeus receives no layer of this product.")).toBeDefined();
});

test("a visitor who is not signed in is told so and offered the form of Sign in", async () => {
  const { onSignIn } = show({ signedIn: false });
  expect(screen.getByText(/You are not signed in to Earthdata\./)).toBeDefined();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(isActive(runButton())).toBe(false);
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

test("while the server has not said whether the visitor is signed in, the pane says that it is checking", () => {
  show({ signedIn: null });
  expect(screen.getByText("Checking whether you are signed in to Earthdata.")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  expect(isActive(runButton())).toBe(false);
});

test("the area starts empty and is taken from the view of the map", async () => {
  show();
  expect(sides()).toEqual(["", "", "", ""]);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Drawn area" }).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Map view" }));
  expect(Number(side("West").value)).toBeCloseTo(-71.4493, 3);
  expect(Number(side("East").value)).toBeCloseTo(-70.3507, 3);
  expect(screen.getByText(/^The area has a surface of [\d,]+ km²\.$/)).toBeDefined();
});

test("the area follows the drawn area until the visitor changes it", async () => {
  areaStore.set(AREA);
  show();
  expect(sides()).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
  expect(screen.getByText("The area has a surface of 1,429 km².")).toBeDefined();
  act(() => areaStore.set({ ...AREA, west: -71.3 }));
  expect(side("West").value).toBe("-71.3");
  await userEvent.clear(side("North"));
  await userEvent.type(side("North"), "43");
  act(() => areaStore.set(AREA));
  expect(sides()).toEqual(["-71.3", "42.6", "-70.75", "43"]);
  await userEvent.click(screen.getByRole("button", { name: "Drawn area" }));
  expect(sides()).toEqual(["-71.2", "42.6", "-70.75", "42.95"]);
});

test("the area is taken from the outline of the product", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "Outline of the product" }));
  expect(sides()).toEqual(["-72.6341", "41.1647", "-68.7564", "43.9877"]);
  expect(
    screen.getByText(/A part of the area lies outside the outline of the product GCOV, 21 Oct 2026/),
  ).toBeDefined();
});

test("a wrong area is named and nothing is sent", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea({ ...AREA, west: -70 });
  expect(screen.getByRole("alert").textContent).toMatch(/West must be smaller than east/);
  expect(screen.getByText("1 layer is chosen. Give the area.")).toBeDefined();
  await userEvent.clear(side("South"));
  expect(screen.getByRole("alert").textContent).toBe("Give the four sides of the area as numbers.");
  await userEvent.click(runButton());
  expect(server.sent("POST")).toEqual([]);
});

test("an area outside the product is refused before anything is sent", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea({ west: -60, south: 42.6, east: -59, north: 42.95 });
  expect(screen.getByRole("alert").textContent).toBe(
    "The area lies outside the outline of the product GCOV, 21 Oct 2026, track 141, frame 67.",
  );
  expect(isActive(runButton())).toBe(false);
  await typeArea();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(isActive(runButton())).toBe(true);
});

test("the estimate states the cells and the size of each chosen layer that has a cell size", async () => {
  show();
  await typeArea();
  expect(screen.queryByText("Estimate")).toBeNull();
  await userEvent.click(layerBox("Backscatter HH"));
  await userEvent.click(layerBox("Mask of valid samples"));
  expect(screen.getByText("Estimate")).toBeDefined();
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Backscatter HH: up to 14 million cells, up to 57 MB before compression",
  ]);
  expect(screen.getByText("2 jobs will be started, one for each layer.")).toBeDefined();
});

test("a layer above the limit of the server is refused in the form", async () => {
  server.process = {
    id: GET_LAYER,
    additionalParameters: { parameters: [{ name: "most-cells", value: [10_000_000] }] },
  };
  show();
  await vi.waitFor(() => expect(cellLimitStore.get()).toBe(10_000_000));
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(screen.getByRole("alert").textContent).toBe(
    'The area is too large for the layer "Backscatter HH": the layer would have about 14 million cells, and Lynkeus receives at most 10 million. Choose a smaller area.',
  );
  expect(isActive(runButton())).toBe(false);
  await typeArea({ ...AREA, north: 42.7 });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(isActive(runButton())).toBe(true);
});

test("a request starts one job, and the foot shows its progress and its outcome", async () => {
  show();
  await userEvent.click(layerBox("Backscatter HH"));
  await typeArea();
  expect(screen.getByText("One job will be started.")).toBeDefined();
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
  });
  await act(() => loadJobs());
  expect(screen.getByText("The layer was received.")).toBeDefined();
  expect(isActive(runButton())).toBe(true);
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
  expect(screen.getByRole("button", { name: "Outline of the products" })).toBeDefined();
  await userEvent.click(within(groups[0] as HTMLElement).getByRole("checkbox", { name: "Backscatter HH" }));
  await userEvent.click(layerBox("Backscatter HV"));
  await userEvent.click(within(groups[1] as HTMLElement).getByRole("checkbox", { name: "Backscatter HH" }));
  await typeArea();
  expect(screen.getByText("3 jobs will be started, one for each layer.")).toBeDefined();
  expect(
    screen.getByText(/^Backscatter HH, GCOV, 2 Nov 2026, track 141, frame 67: up to 14 million cells/),
  ).toBeDefined();
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
  expect(panesOf(dockStore.get(), "right").map(({ id }) => id)).toEqual([GET_LAYER, "catalog"]);
  expect(frontOf(dockStore.get(), "right")).toBe(GET_LAYER);
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
  expect(runOf(started, [done("a"), done("b")])).toMatchObject({ state: "success", text: "2 layers were received." });
  expect(runOf(started, [failed("a"), failed("b")])).toMatchObject({ state: "error", text: "All 2 jobs failed." });
  expect(runOf(started, [done("a"), failed("b")])).toMatchObject({
    state: "warning",
    text: "1 of 2 layers were received. 1 job failed.",
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
