import { afterEach, expect, test, vi } from "vitest";
import gcov from "../../../api/tests/data/product-gcov.json";
import { exportName, productsCsv, productsGeoJson, saveFile } from "./export";
import { isProduct, type Product } from "./products";

function products(): Product[] {
  if (!isProduct(gcov)) {
    throw new Error("the product of the test is not valid");
  }
  const pair: Product = {
    ...gcov,
    id: "G1-ASF",
    name: 'A "pair", quoted',
    product: "GUNW",
    dates: ["2026-10-09", "2026-10-21"],
    side_channels: [],
    side_bandwidth: null,
    joint: false,
    size: null,
  };
  return [gcov, pair];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("products are written as a table of comma-separated values", () => {
  const lines = productsCsv(products()).split("\r\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toBe(
    "name,id,product,collection,maturity,start,end,date_1,date_2,days_between,track,frame,direction,cycle,orbit,bands,channels_a,channels_b,bandwidth_a_mhz,bandwidth_b_mhz,coverage,joint,version,size_bytes",
  );
  expect(lines[1]).toBe(
    "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001,G4405194348-ASF,GCOV,NISAR_L2_GCOV_V1,Validated,2026-10-21T23:43:30Z,2026-10-21T23:44:05.999342Z,2026-10-21,,,141,67,descending,33,6468,A+B,HH+HV,HH+HV,40,5,full,true,1.0.20,5758779392",
  );
  // A value with a comma or a quotation mark stands between quotation marks, and its own marks are doubled.
  expect(lines[2]).toMatch(
    /^"A ""pair"", quoted",G1-ASF,GUNW,.*,2026-10-09,2026-10-21,12,141,67,.*,HH\+HV,,40,,full,false,1\.0\.20,$/,
  );
  expect(lines[3]).toBe("");
});

test("products are written as a GeoJSON feature collection", () => {
  const collection = JSON.parse(productsGeoJson(products())) as {
    type: string;
    features: {
      type: string;
      id: string;
      geometry: { type: string; coordinates: number[][][][] };
      properties: Record<string, unknown>;
    }[];
  };
  expect(collection.type).toBe("FeatureCollection");
  expect(collection.features).toHaveLength(2);
  const [first, second] = collection.features;
  expect(first?.id).toBe("G4405194348-ASF");
  expect(first?.geometry.type).toBe("MultiPolygon");
  expect(first?.geometry.coordinates[0]?.[0]).toEqual(gcov.footprint[0]);
  expect(first?.properties).toMatchObject({
    product: "GCOV",
    track: 141,
    frame: 67,
    date_2: null,
    size_bytes: 5758779392,
  });
  expect(second?.properties).toMatchObject({ days_between: 12, joint: false, size_bytes: null });
});

test("the saved file is named after the product type and the day", () => {
  const today = new Date("2026-11-14T12:00:00Z");
  const [first, second] = products();
  expect(exportName(first ? [first] : [], "csv", today)).toBe("nisar-gcov-2026-11-14.csv");
  expect(exportName(first && second ? [first, second] : [], "geojson", today)).toBe(
    "nisar-products-2026-11-14.geojson",
  );
});

test("a text is given to the user as a file to save", async () => {
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      blobs.push(blob);
      return "blob:lynkeus-test";
    },
    revokeObjectURL: (address: string) => revoked.push(address),
  });
  const clicked: { href: string; download: string }[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  saveFile("list.csv", "text/csv", "name\r\n");
  click.mockRestore();
  expect(clicked).toEqual([{ href: "blob:lynkeus-test", download: "list.csv" }]);
  expect(blobs[0]?.type).toBe("text/csv");
  expect(await blobs[0]?.text()).toBe("name\r\n");
  expect(revoked).toEqual(["blob:lynkeus-test"]);
  expect(document.querySelector("a[download]")).toBeNull();
});
