import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { PropertiesWindow } from "./Properties";
import { propertiesStore } from "./state";

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

/** The value that stands under a term of the window. */
function valueOf(term: string): string | null | undefined {
  return screen.getByText(term).nextElementSibling?.textContent;
}

beforeEach(() => {
  mapLayersStore.set([]);
  propertiesStore.set(null);
});

test("the window shows what the layer is, where it comes from and the grid of its file", async () => {
  addToMap(RESULT);
  propertiesStore.set({ id: "change", time: 1 });
  render(<PropertiesWindow />);
  expect(screen.getByRole("heading", { name: "Properties of Coherence HH, 20 m" })).toBeTruthy();
  expect(valueOf("Kind")).toBe("Result of an analysis tool");
  expect(valueOf("Quantity")).toBe("Interferometric coherence magnitude, HH");
  expect(valueOf("Unit")).toBe("None (a quantity without dimension)");
  expect(valueOf("Dates")).toBe("9 Oct 2026 and 21 Oct 2026");
  expect(valueOf("Product files")).toBe("NISAR_L2_PR_GUNW_032_141_D_067");
  expect(valueOf("Program")).toBe("Lynkeus 0.1.0");
  expect(valueOf("Method")).toBe("docs/methods/coherence.md");
  // The projection and the grid of testdata/coherence.json, as rasterio reads them.
  expect(await screen.findByText("EPSG:32619")).toBeTruthy();
  expect(valueOf("Grid")).toBe("128 columns by 96 rows, cells of 20 by 20 metres");
  expect(valueOf("Extent (west, south, east, north, in metres)")).toBe("337520, 4737680, 340080, 4739600");
  expect(valueOf("Reduced copies in the file")).toBe("64 by 48 cells");
  expect(valueOf("Value of a cell without data")).toBe("NaN");
  expect(valueOf("Statistics that the file states")).toBe(
    "Lowest value 0.0608, highest value 0.989, mean 0.537, standard deviation 0.134",
  );
  expect(screen.getByRole("link", { name: "/files/change/coherence.tif" }).getAttribute("href")).toBe(
    "/files/change/coherence.tif",
  );
  expect(screen.getByRole("link", { name: "/files/change/coherence.json" })).toBeTruthy();
});

test("a layer of a product has no method, and a file that cannot be read is named", async () => {
  addToMap({ ...RESULT, kind: "layer", method: null, url: "/files/change/missing.tif", inputs: ["NISAR_L2_PR_GUNW"] });
  propertiesStore.set({ id: "change", time: 1 });
  render(<PropertiesWindow />);
  expect(valueOf("Kind")).toBe("Layer of a NISAR product");
  expect(screen.queryByText("Method")).toBeNull();
  expect(valueOf("Product file")).toBe("NISAR_L2_PR_GUNW");
  expect(await screen.findByText("The file of the layer could not be read.")).toBeTruthy();
});

test("without a layer the window is closed", () => {
  const { container } = render(<PropertiesWindow />);
  expect(container.querySelector("dialog")?.open).toBe(false);
});
