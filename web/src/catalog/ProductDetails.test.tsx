import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import detail from "../../../api/tests/data/detail-gcov.json";
import { isProductDetail } from "../data/products";
import { stopSearch } from "../data/run";
import { clearProducts, productsStore, selectedProductStore } from "../data/state";
import { pairProduct, realProduct, serverWith, someProducts, testMap } from "../data/testProducts";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { ProductDetails, productRows, recordRows } from "./ProductDetails";

function show(product = realProduct()) {
  return render(
    <MapContext value={testMap()}>
      <ProductDetails product={product} />
    </MapContext>,
  );
}

function row(name: string): string | null | undefined {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling?.textContent;
}

beforeEach(() => {
  clearProducts();
  stopSearch();
  messagesStore.set([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the rows of a product of one acquisition state what the result list knows", () => {
  expect(productRows(realProduct())).toEqual([
    ["Product type", "GCOV (Geocoded Polarimetric Covariance)"],
    ["Collection", "NISAR_L2_GCOV_V1 (validated)"],
    ["Start", "21 Oct 2026, 23:43:30 UTC"],
    ["End", "21 Oct 2026, 23:44:05 UTC"],
    ["Track", "141"],
    ["Frame", "67"],
    ["Direction of the orbit", "descending"],
    ["Cycle", "33"],
    ["Absolute orbit", "6468"],
    ["Frequency bands", "A, B"],
    ["Channels of band A", "HH, HV"],
    ["Channels of band B", "HH, HV"],
    ["Bandwidth of band A", "40 MHz"],
    ["Bandwidth of band B", "5 MHz"],
    ["Coverage of the frame", "full"],
    ["Observed with the S-band radar", "Yes"],
    ["Version of the product", "1.0.20"],
    ["Size of the product file", "5.8 GB"],
    ["Identifier in the catalogue", "G4405194348-ASF"],
  ]);
});

test("the rows of a pair state its two dates and the days between them, and leave out what its record does not state", () => {
  const rows = new Map(productRows({ ...pairProduct("2026-07-17", "2026-08-10"), joint: null, cycle: null }));
  expect(rows.get("First acquisition")).toBe("17 Jul 2026");
  expect(rows.get("Second acquisition")).toBe("10 Aug 2026");
  expect(rows.get("Days between")).toBe("24");
  for (const name of ["Start", "Channels of band B", "Bandwidth of band B", "Size of the product file", "Cycle"]) {
    expect(rows.has(name)).toBe(false);
  }
  expect(rows.has("Observed with the S-band radar")).toBe(false);
});

test("the rows of the full record state how the product was made", () => {
  if (!isProductDetail(detail)) {
    throw new Error("the details of the test are not valid");
  }
  expect(recordRows(detail)).toEqual([
    ["Side to which the radar looked", "left"],
    ["Covers", "Land, North America"],
    ["Made on", "8 Nov 2026, 02:38:28 UTC"],
    ["Made by the program", "GCOV_L_PGE R05.03.2"],
    ["SASVersionId", "ISCE3 0.25.21"],
    ["CRID", "P05036"],
    ["ProductCounter", "1"],
    ["Record last changed", "8 Nov 2026, 02:47:46 UTC"],
    ["Made from", "NISAR_L1_PR_RSLC_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"],
  ]);
});

test("the details show the record of the product, its browse image and its files", async () => {
  const { fetch, asked } = serverWith(detail);
  vi.stubGlobal("fetch", fetch);
  show();
  expect(screen.getByRole("status").textContent).toBe("Reading the record of the product.");
  expect(row("Track")).toBe("141");
  expect(await screen.findByText("Made by the program")).toBeDefined();
  expect(asked).toEqual(["/api/products/G4405194348-ASF"]);
  expect(screen.queryByRole("status")).toBeNull();
  expect(row("CRID")).toBe("P05036");
  const image = screen.getByRole<HTMLImageElement>("img", { name: "Browse image of the product" });
  expect(image.getAttribute("src")).toBe("/api/products/G4405194348-ASF/browse");
  const full = screen.getByRole<HTMLAnchorElement>("link", { name: "Browse image in full size" });
  expect(full.href).toMatch(/\/BROWSE\/NISAR_L2_GCOV_V1\/.*_LATLON\.png$/);
  expect(screen.getByText("Files (23)")).toBeDefined();
  const data = screen.getByRole<HTMLAnchorElement>("link", { name: ".h5", hidden: true });
  expect(data.href).toMatch(/^https:\/\/nisar\.asf\.earthdatacloud\.nasa\.gov\/NISAR\/NISAR_L2_GCOV_V1\/.*_001\.h5$/);
  expect(data.target).toBe("_blank");
  expect(data.parentElement?.textContent).toBe(".h5 5.8 GB");
  expect(screen.getByText("Attributes of the record (21)")).toBeDefined();
  expect(row("STACK_ID")).toBe("141_D_067");
});

test("a record that cannot be received is named, and the rows of the list stay", async () => {
  vi.stubGlobal(
    "fetch",
    serverWith({ status: 502, detail: "NASA's catalogue did not answer, or its answer could not be read." }).fetch,
  );
  show();
  expect((await screen.findByRole("alert")).textContent).toBe(
    "NASA's catalogue did not answer, or its answer could not be read.",
  );
  expect(row("Frame")).toBe("67");
  expect(screen.queryByRole("img")).toBeNull();
});

test("the details of another product replace those of the product before", async () => {
  const { fetch, asked } = serverWith(detail);
  vi.stubGlobal("fetch", fetch);
  const [first, second] = someProducts(2);
  if (!first || !second) {
    throw new Error("the test has no products");
  }
  const { rerender } = show(first);
  expect(await screen.findByText("Made by the program")).toBeDefined();
  rerender(
    <MapContext value={testMap()}>
      <ProductDetails product={second} />
    </MapContext>,
  );
  expect(screen.queryByText("Made by the program")).toBeNull();
  expect(await screen.findByText("Made by the program")).toBeDefined();
  expect(asked).toEqual(["/api/products/G0-ASF", "/api/products/G1-ASF"]);
});

test("the buttons of the details end the selection and search the stack of the frame", async () => {
  const { fetch, asked } = serverWith(detail, { found: 11, products: someProducts(11) });
  vi.stubGlobal("fetch", fetch);
  selectedProductStore.set("G4405194348-ASF");
  show();
  await screen.findByText("Made by the program");
  const section = within(screen.getByRole("region", { name: "Product details" }));
  await userEvent.click(section.getByRole("button", { name: "All dates of this frame" }));
  await vi.waitFor(() => expect(productsStore.get()?.found).toBe(11));
  expect(asked[1]).toMatch(/track=141&frame=67&direction=descending$/);
  await userEvent.click(section.getByRole("button", { name: "Zoom to" }));
  selectedProductStore.set("G4405194348-ASF");
  await userEvent.click(section.getByRole("button", { name: "Close the details and end the selection" }));
  expect(selectedProductStore.get()).toBeNull();
});
