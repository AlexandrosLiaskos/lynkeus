import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { copyText } from "../shared/clipboard";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { serversStore } from "../shared/servers";
import { LABORATORY, OFFICE, SERVERS } from "../servers/testServers";
import { keptRow, PropertiesWindow, wholeAddress } from "./Properties";
import { propertiesStore } from "./state";

vi.mock("../shared/clipboard", () => ({ copyText: vi.fn() }));

// The window reads the test files in place of files of the site.
vi.mock("./files", async () => {
  const { openTestFile } = await import("./testdata/files");
  return {
    fileOf: (url: string) => (url.includes("missing") ? Promise.reject(new Error("404")) : openTestFile("coherence")),
    forgetFile: () => undefined,
  };
});

const RESULT: LayerDescription = {
  id: "change",
  title: "Coherence HH, 20 m",
  kind: "result",
  url: "/files/change/coherence.tif",
  quantity: "Interferometric coherence magnitude, HH",
  unit: "1",
  range: [0, 1],
  colours: "grey",
  dates: ["2026-10-09", "2026-10-21"],
  inputs: ["NISAR_L2_PR_GUNW_032_141_D_067", "NISAR_L2_PR_GCOV_033_141_D_067"],
  program: "Lynkeus 0.1.0",
  method: "docs/methods/coherence.md",
  record: "/files/change/coherence.json",
};

/** The group of the window under a heading. */
function groupOf(title: string): HTMLElement {
  const group = screen.getByRole("heading", { level: 4, name: title }).parentElement;
  if (!group) {
    throw new Error(`The window has no group ${title}.`);
  }
  return group;
}

/** The names of the rows of a group, in their order. */
function namesOf(title: string): (string | null | undefined)[] {
  return within(groupOf(title))
    .getAllByRole("term")
    .map((term) => term.firstElementChild?.textContent);
}

/** The value that a group shows beside a name. */
function valueOf(title: string, name: string): string | null | undefined {
  const term = within(groupOf(title)).getByText(name).closest("dt");
  return term?.nextElementSibling?.firstElementChild?.textContent;
}

function show(layer: LayerDescription) {
  addToMap(layer);
  propertiesStore.set({ id: layer.id, time: 1 });
  render(<PropertiesWindow />);
}

beforeEach(() => {
  vi.mocked(copyText).mockReset().mockResolvedValue(undefined);
  mapLayersStore.set([]);
  propertiesStore.set(null);
  serversStore.set(null);
});

test("the window lists the properties in four groups: the layer, the projection and grid, the file and the record", async () => {
  show(RESULT);
  expect(screen.getByRole("heading", { name: "Properties of Coherence HH, 20 m" })).toBeTruthy();
  await screen.findByText("EPSG:32619");
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
    "Layer",
    "Projection and grid",
    "File",
    "Record",
  ]);
  expect(namesOf("Layer")).toEqual([
    "Name",
    "Kind",
    "Quantity",
    "Unit",
    "Dates",
    "Product file 1",
    "Product file 2",
    "Program",
    "Method",
  ]);
  expect(namesOf("Projection and grid")).toEqual(["Projection", "Size", "Cell size (m)", "Extent (m)"]);
  expect(namesOf("File")).toEqual([
    "Address",
    "Kept on",
    "Reduced copies",
    "Value without data",
    "Lowest value",
    "Highest value",
    "Mean",
    "Standard deviation",
  ]);
  expect(namesOf("Record")).toEqual(["Address"]);
});

test("the group of the layer shows what the layer is and where it comes from", () => {
  show(RESULT);
  expect(valueOf("Layer", "Name")).toBe("Coherence HH, 20 m");
  expect(valueOf("Layer", "Kind")).toBe("Result of an analysis tool");
  expect(valueOf("Layer", "Quantity")).toBe("Interferometric coherence magnitude, HH");
  expect(valueOf("Layer", "Unit")).toBe("None");
  expect(valueOf("Layer", "Dates")).toBe("9 Oct 2026 and 21 Oct 2026");
  expect(valueOf("Layer", "Product file 1")).toBe("NISAR_L2_PR_GUNW_032_141_D_067");
  expect(valueOf("Layer", "Product file 2")).toBe("NISAR_L2_PR_GCOV_033_141_D_067");
  expect(valueOf("Layer", "Program")).toBe("Lynkeus 0.1.0");
  expect(valueOf("Layer", "Method")).toBe("docs/methods/coherence.md");
});

test("the projection, the grid and the values of the file are read from the file", async () => {
  show(RESULT);
  // The projection and the grid of testdata/coherence.json, as rasterio reads them.
  expect(await screen.findByText("EPSG:32619")).toBeTruthy();
  expect(valueOf("Projection and grid", "Size")).toBe("128 columns by 96 rows");
  expect(valueOf("Projection and grid", "Cell size (m)")).toBe("20 by 20");
  expect(valueOf("Projection and grid", "Extent (m)")).toBe("337520, 4737680, 340080, 4739600");
  expect(valueOf("File", "Reduced copies")).toBe("64 by 48 cells");
  expect(valueOf("File", "Value without data")).toBe("NaN");
  expect(valueOf("File", "Lowest value")).toBe("0.0608");
  expect(valueOf("File", "Highest value")).toBe("0.989");
  expect(valueOf("File", "Mean")).toBe("0.537");
  expect(valueOf("File", "Standard deviation")).toBe("0.134");
});

test("an address is a link, and its button copies the whole address", async () => {
  show(RESULT);
  await screen.findByText("EPSG:32619");
  const file = within(groupOf("File")).getByRole("link", { name: "/files/change/coherence.tif" });
  expect(file.getAttribute("href")).toBe("/files/change/coherence.tif");
  expect(within(groupOf("Record")).getByRole("link", { name: "/files/change/coherence.json" })).toBeTruthy();
  await userEvent.click(within(groupOf("File")).getByRole("button", { name: "Copy Address" }));
  expect(copyText).toHaveBeenLastCalledWith(wholeAddress("/files/change/coherence.tif", window.location.href));
  await userEvent.click(within(groupOf("Record")).getByRole("button", { name: "Copy Address" }));
  expect(copyText).toHaveBeenLastCalledWith(wholeAddress("/files/change/coherence.json", window.location.href));
});

test("the whole address of a file of the site carries the name of the site", () => {
  expect(wholeAddress("/files/change/coherence.tif", "https://lynkeus.example/map?view=1")).toBe(
    "https://lynkeus.example/files/change/coherence.tif",
  );
  expect(wholeAddress("https://data.example/a.tif", "https://lynkeus.example/")).toBe("https://data.example/a.tif");
  // An address that cannot be completed is copied as it is.
  expect(wholeAddress("/files/a.tif", "about:blank")).toBe("/files/a.tif");
});

test("the name of a product file and the extent of the grid can be copied", async () => {
  show(RESULT);
  await userEvent.click(screen.getByRole("button", { name: "Copy Product file 2" }));
  expect(copyText).toHaveBeenLastCalledWith("NISAR_L2_PR_GCOV_033_141_D_067");
  await userEvent.click(await screen.findByRole("button", { name: "Copy Extent (m)" }));
  expect(copyText).toHaveBeenLastCalledWith("337520, 4737680, 340080, 4739600");
});

test("the name of a format or of a field of the file stands behind an i, not in the name of a row", () => {
  show(RESULT);
  expect(screen.queryByText(/Cloud Optimized GeoTIFF\)|STAC Item\)/)).toBeNull();
  expect(screen.getByText("The file is a Cloud Optimized GeoTIFF.")).toBeTruthy();
  expect(screen.getByText("The record is a STAC Item, which describes the layer.")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Information about Address" })).toHaveLength(2);
});

test("a layer of a product has no method, and one product file is named without a number", () => {
  show({ ...RESULT, kind: "layer", method: null, inputs: ["NISAR_L2_PR_GUNW"] });
  expect(valueOf("Layer", "Kind")).toBe("Layer of a NISAR product");
  expect(namesOf("Layer")).not.toContain("Method");
  expect(valueOf("Layer", "Product file")).toBe("NISAR_L2_PR_GUNW");
});

test("while the file is read a notice says so, and the rest of the list is shown", async () => {
  show(RESULT);
  expect(screen.getByRole("status").textContent).toBe("Reading the file of the layer.");
  expect(namesOf("File")).toEqual(["Address", "Kept on"]);
  await screen.findByText("EPSG:32619");
  expect(screen.queryByText("Reading the file of the layer.")).toBeNull();
});

test("a file that cannot be read is named in a notice, and the list keeps the layer, the file and the record", async () => {
  show({ ...RESULT, url: "/files/change/missing.tif" });
  expect((await screen.findByRole("alert")).textContent).toBe(
    "The file of the layer could not be read. Its projection, its grid and its values are not shown.",
  );
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
    "Layer",
    "File",
    "Record",
  ]);
  expect(valueOf("Layer", "Name")).toBe("Coherence HH, 20 m");
});

test("without a layer the window is closed", () => {
  const { container } = render(<PropertiesWindow />);
  expect(container.querySelector("dialog")?.open).toBe(false);
});

const fileOn = (server: string) => `/api/servers/${server}/files/fedcba9876543210fedcba9876543210/coherence.tif`;

test("the file of a layer says which server keeps it", () => {
  expect(keptRow("/files/change/coherence.tif", SERVERS.servers).value).toBe("Project server");
  expect(keptRow(fileOn(OFFICE.id), SERVERS.servers).value).toBe('Your server "Office computer"');
  expect(keptRow(fileOn(LABORATORY.id), SERVERS.servers).value).toBe(
    'Your server "Laboratory server", which is not connected',
  );
  expect(keptRow(fileOn(OFFICE.id), []).value).toBe("An own server");
});

test("the window names the own server that keeps the file of a layer", async () => {
  serversStore.set(SERVERS);
  show({ ...RESULT, url: fileOn(OFFICE.id), record: fileOn(OFFICE.id).replace(".tif", ".json") });
  await screen.findByText("EPSG:32619");
  expect(valueOf("File", "Kept on")).toBe('Your server "Office computer"');
  expect(valueOf("File", "Address")).toBe(fileOn(OFFICE.id));
});
