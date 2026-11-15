// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import detail from "../../../api/tests/data/detail-gcov.json";
import { isProductDetail, type ProductDetail } from "../data/products";
import { stopSearch } from "../data/run";
import { clearProducts, GET_LAYER_PANE, productsStore } from "../data/state";
import { pairProduct, realProduct, serverWith, someProducts, testMap } from "../data/testProducts";
import { copyText } from "../shared/clipboard";
import { dockStore, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import type { PropertyGroup } from "../shared/properties/PropertyList";
import { ProductDetails } from "./ProductDetails";
import { attributeRows, otherIdentifiers, productGroups } from "./productProperties";

vi.mock("../shared/clipboard", () => ({ copyText: vi.fn() }));

function record(): ProductDetail {
  if (!isProductDetail(detail)) {
    throw new Error("the details of the test are not valid");
  }
  return detail;
}

function show(product = realProduct(), onBack = () => undefined) {
  return render(
    <MapContext value={testMap()}>
      <ProductDetails product={product} onBack={onBack} />
    </MapContext>,
  );
}

/** The value that the page shows for a property, by the name of the property. */
function row(name: string): string | null | undefined {
  return screen
    .getByText(name, { selector: ".property-name > span" })
    .closest(".property-row")
    ?.querySelector(".property-value-text")?.textContent;
}

/** The groups of a property list as their titles with the names and the values of their rows. */
function written(groups: readonly PropertyGroup[]): [string | undefined, [string, unknown][]][] {
  return groups.map(({ title, rows }) => [title, rows.map(({ name, value }) => [name, value])]);
}

beforeEach(() => {
  clearProducts();
  stopSearch();
  resetDock();
  messagesStore.set([]);
  vi.mocked(copyText).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the properties of a product of one acquisition stand in groups, before its record is read", () => {
  expect(written(productGroups(realProduct(), null))).toEqual([
    [
      "Product",
      [
        ["Product type", "GCOV (Geocoded Polarimetric Covariance)"],
        ["Collection", "NISAR_L2_GCOV_V1"],
        ["Level of validation", "Validated"],
        ["Version", "1.0.20"],
        ["Size", "5.8 GB"],
        ["Catalogue identifier", "G4405194348-ASF"],
      ],
    ],
    [
      "Acquisition",
      [
        ["Start", "21 Oct 2026, 23:43:30 UTC"],
        ["End", "21 Oct 2026, 23:44:05 UTC"],
        ["Frame coverage", "Full"],
      ],
    ],
    [
      "Orbit",
      [
        ["Track", "141"],
        ["Frame", "67"],
        ["Direction", "Descending"],
        ["Cycle", "33"],
        ["Absolute orbit", "6468"],
      ],
    ],
    [
      "Radar",
      [
        ["Frequency bands", "A, B"],
        ["Channels of band A", "HH, HV"],
        ["Channels of band B", "HH, HV"],
        ["Bandwidth of band A", "40 MHz"],
        ["Bandwidth of band B", "5 MHz"],
        ["Joint observation", "Yes"],
      ],
    ],
  ]);
});

test("the properties of a pair state its two dates and the days between them, and leave out what its record does not state", () => {
  const groups = productGroups({ ...pairProduct("2026-07-17", "2026-08-10"), joint: null, cycle: null }, null);
  const rows = new Map(groups.flatMap(({ rows: part }) => part.map(({ name, value }) => [name, value])));
  expect(rows.get("First acquisition")).toBe("17 Jul 2026");
  expect(rows.get("Second acquisition")).toBe("10 Aug 2026");
  expect(rows.get("Days between")).toBe("24");
  expect(rows.has("Start of the first")).toBe(true);
  for (const name of ["Start", "Channels of band B", "Bandwidth of band B", "Size", "Cycle", "Joint observation"]) {
    expect(rows.has(name)).toBe(false);
  }
});

test("the full record adds what it alone states, and names the identifiers whose meaning is known", () => {
  const groups = productGroups(realProduct(), record());
  const rows = new Map(groups.flatMap(({ rows: part }) => part.map(({ name, value }) => [name, value])));
  expect(rows.get("Covers")).toBe("Land, North America");
  expect(rows.get("Look direction")).toBe("Left");
  expect(written(groups.slice(-1))).toEqual([
    [
      "Processing",
      [
        ["Produced", "8 Nov 2026, 02:38:28 UTC"],
        ["Program", "GCOV_L_PGE R05.03.2"],
        ["Composite release identifier", "P05036"],
        ["Product counter", "1"],
        ["Record changed", "8 Nov 2026, 02:47:46 UTC"],
        [
          "Input products",
          "NISAR_L1_PR_RSLC_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5",
        ],
      ],
    ],
  ]);
  const named = groups.at(-1)?.rows.find(({ name }) => name === "Composite release identifier");
  expect(named?.info).toMatch(/^The identifier CRID of the record\./);
  expect(named?.copy).toBe(true);
});

test("an identifier without a readable name keeps the name of the record", () => {
  expect(otherIdentifiers(record())).toEqual([{ name: "SASVersionId", values: ["ISCE3 0.25.21"] }]);
  expect(attributeRows([{ name: "FREQUENCIES", values: ["A", "B"] }])).toEqual([
    { name: "FREQUENCIES", value: "A, B" },
  ]);
});

test("the details show the name, the browse image, the record and the files of the product", async () => {
  const { fetch, asked } = serverWith(detail);
  vi.stubGlobal("fetch", fetch);
  show();
  expect(screen.getByRole("status").textContent).toBe("Reading the record of the product.");
  expect(screen.getByRole("heading", { level: 4, name: realProduct().name })).toBeDefined();
  expect(row("Track")).toBe("141");
  expect(await screen.findByText("Program")).toBeDefined();
  expect(asked).toEqual(["/api/products/G4405194348-ASF"]);
  expect(screen.queryByRole("status")).toBeNull();
  expect(row("Composite release identifier")).toBe("P05036");
  expect(screen.getByRole("button", { name: "Information about Composite release identifier" })).toBeDefined();
  expect(
    [...document.querySelectorAll(".catalog-details > .property-list .property-group-title")].map(
      (title) => title.textContent,
    ),
  ).toEqual(["Product", "Acquisition", "Orbit", "Radar", "Processing"]);
  const image = screen.getByRole<HTMLImageElement>("img", { name: "Browse image of the product" });
  expect(image.getAttribute("src")).toBe("/api/products/G4405194348-ASF/browse");
  const full = screen.getByRole<HTMLAnchorElement>("link", { name: "Image in full size (opens in a new tab)" });
  expect(full.href).toMatch(/\/BROWSE\/NISAR_L2_GCOV_V1\/.*_LATLON\.png$/);
});

test("the files, the attributes of the record and the other identifiers stand in sections that start closed", async () => {
  vi.stubGlobal("fetch", serverWith(detail).fetch);
  show();
  await screen.findByText("Program");
  for (const name of ["Files (23)", "Record attributes (21)", "Other identifiers (1)"]) {
    expect(screen.getByRole("button", { name }).getAttribute("aria-expanded")).toBe("false");
  }
  expect(screen.queryByRole("link", { name: ".h5" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Files (23)" }));
  const data = screen.getByRole<HTMLAnchorElement>("link", { name: ".h5" });
  expect(data.href).toMatch(/^https:\/\/nisar\.asf\.earthdatacloud\.nasa\.gov\/NISAR\/NISAR_L2_GCOV_V1\/.*_001\.h5$/);
  expect(data.target).toBe("_blank");
  expect(data.parentElement?.textContent).toBe(".h5 5.8 GB");
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(
    expect.arrayContaining(["Product file", "Browse images", "Quality reports", "Metadata"]),
  );
  expect(row("STACK_ID")).toBe("141_D_067");
  expect(row("SASVersionId")).toBe("ISCE3 0.25.21");
});

test("a record that cannot be received is named, the properties of the list stay, and the record is read again", async () => {
  const { fetch, asked } = serverWith(
    { status: 502, detail: "NASA's catalogue did not answer, or its answer could not be read." },
    detail,
  );
  vi.stubGlobal("fetch", fetch);
  show();
  expect((await screen.findByRole("alert")).textContent).toBe(
    "NASA's catalogue did not answer, or its answer could not be read.",
  );
  expect(row("Frame")).toBe("67");
  expect(screen.queryByRole("img")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Read again" }));
  expect(await screen.findByText("Program")).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(asked).toHaveLength(2);
});

test("the details of another product replace those of the product before", async () => {
  const { fetch, asked } = serverWith(detail);
  vi.stubGlobal("fetch", fetch);
  const [first, second] = someProducts(2);
  if (!first || !second) {
    throw new Error("the test has no products");
  }
  const { rerender } = show(first);
  expect(await screen.findByText("Program")).toBeDefined();
  rerender(
    <MapContext value={testMap()}>
      <ProductDetails product={second} onBack={() => undefined} />
    </MapContext>,
  );
  expect(screen.queryByText("Program")).toBeNull();
  expect(await screen.findByText("Program")).toBeDefined();
  expect(asked).toEqual(["/api/products/G0-ASF", "/api/products/G1-ASF"]);
});

test("the commands of the details get a layer, search the stack of the frame and return to the list", async () => {
  const { fetch, asked } = serverWith(detail, { found: 11, products: someProducts(11) });
  vi.stubGlobal("fetch", fetch);
  const onBack = vi.fn();
  show(realProduct(), onBack);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to products" }));
  await screen.findByText("Program");
  const commands = within(screen.getByRole("group", { name: "Commands of the product" }));
  expect(commands.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Get layer",
    "Zoom to",
    "All dates of this frame",
  ]);
  await userEvent.click(commands.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toEqual([GET_LAYER_PANE]);
  await userEvent.click(commands.getByRole("button", { name: "Zoom to" }));
  await userEvent.click(commands.getByRole("button", { name: "All dates of this frame" }));
  await vi.waitFor(() => expect(productsStore.get()?.found).toBe(11));
  expect(asked[1]).toMatch(/track=141&frame=67&direction=descending$/);
  await userEvent.click(screen.getByRole("button", { name: "Back to products" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("the name of the product is copied, and a refusal of the browser is reported", async () => {
  vi.stubGlobal("fetch", serverWith(detail).fetch);
  show();
  await screen.findByText("Program");
  await userEvent.click(screen.getByRole("button", { name: "Copy the product name" }));
  expect(copyText).toHaveBeenCalledWith(realProduct().name);
  expect((await screen.findByRole("status")).textContent).toBe("Copied");
  vi.mocked(copyText).mockRejectedValue(new Error("refused"));
  await userEvent.click(screen.getByRole("button", { name: "Copy the product name" }));
  await act(() => Promise.resolve());
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["error", "The browser did not allow the copy. Select the name and copy it with the keyboard."],
  ]);
});
