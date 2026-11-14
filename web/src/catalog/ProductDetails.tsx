import { useEffect, useId, useState } from "react";
import {
  browseAddress,
  findProduct,
  formatDay,
  formatMoment,
  formatSize,
  pairDays,
  PRODUCT_NAMES,
  type Product,
  type ProductDetail,
  type ProductFile,
} from "../data/products";
import { zoomToProducts } from "../data/Footprints";
import { findStack } from "../data/run";
import { selectedProductStore } from "../data/state";
import { Icon } from "../shared/icon/Icon";
import { useMap } from "../shared/map";

const FILE_KINDS: readonly (readonly [ProductFile["kind"], string])[] = [
  ["data", "Product file (needs an Earthdata account)"],
  ["browse", "Browse images"],
  ["quality", "Quality reports"],
  ["metadata", "Metadata"],
];

function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? "Yes" : "No";
}

function megahertz(value: number | null): string | null {
  return value === null ? null : `${String(value)} MHz`;
}

/** Return what the result list knows about a product, as rows of a name and a value. Rows without a value are left out. */
export function productRows(product: Product): [string, string][] {
  const days = pairDays(product);
  const [first, second] = product.dates;
  const rows: [string, string | null][] = [
    ["Product type", `${product.product} (${PRODUCT_NAMES[product.product]})`],
    ["Collection", `${product.collection} (${product.maturity.toLowerCase()})`],
    ...(days === null || first === undefined || second === undefined
      ? ([
          ["Start", formatMoment(product.start)],
          ["End", formatMoment(product.end)],
        ] as [string, string][])
      : ([
          ["First acquisition", formatDay(first)],
          ["Second acquisition", formatDay(second)],
          ["Days between", String(days)],
          ["Start of the first", formatMoment(product.start)],
          ["End of the second", formatMoment(product.end)],
        ] as [string, string][])),
    ["Track", String(product.track)],
    ["Frame", String(product.frame)],
    ["Direction of the orbit", product.direction],
    ["Cycle", product.cycle === null ? null : String(product.cycle)],
    ["Absolute orbit", product.orbit === null ? null : String(product.orbit)],
    ["Frequency bands", product.bands.join(", ") || null],
    ["Channels of band A", product.channels.join(", ") || null],
    ["Channels of band B", product.side_channels.join(", ") || null],
    ["Bandwidth of band A", megahertz(product.bandwidth)],
    ["Bandwidth of band B", megahertz(product.side_bandwidth)],
    ["Coverage of the frame", product.coverage],
    ["Observed with the S-band radar", yesNo(product.joint)],
    ["Version of the product", product.version],
    ["Size of the product file", product.size === null ? null : formatSize(product.size)],
    ["Identifier in the catalogue", product.id],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

/** Return what only the full record of a product states, as rows of a name and a value. */
export function recordRows(detail: ProductDetail): [string, string][] {
  const rows: [string, string | null][] = [
    ["Side to which the radar looked", detail.look],
    ["Covers", detail.localities.join(", ") || null],
    ["Made on", detail.produced === null ? null : formatMoment(detail.produced)],
    ["Made by the program", detail.software],
    ...detail.identifiers.map(({ name, values }): [string, string] => [name, values.join(", ")]),
    ["Record last changed", detail.recorded === null ? null : formatMoment(detail.recorded)],
    ["Made from", detail.inputs.join(", ") || null],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="catalog-rows">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The record of a product as the server sent it, or the words of the failure to receive it. */
type Loaded = { id: string; detail: ProductDetail } | { id: string; fault: string };

/**
 * The details of the selected product: its browse image, everything that its record in NASA's catalogue
 * states, and the addresses of its files.
 */
export function ProductDetails({ product }: { product: Product }) {
  const map = useMap();
  const headingId = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { id } = product;

  useEffect(() => {
    const controller = new AbortController();
    findProduct(id, controller.signal)
      .then((detail) => setLoaded({ id, detail }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ id, fault: error instanceof Error ? error.message : "The record could not be read." });
        }
      });
    return () => controller.abort();
  }, [id]);

  // The record of the product that was selected before is not shown for this one.
  const current = loaded?.id === id ? loaded : null;
  const detail = current && "detail" in current ? current.detail : null;
  const fault = current && "fault" in current ? current.fault : null;
  const browse = detail?.files.find((file) => file.kind === "browse" && !file.name.endsWith("thumbnail.png"));

  return (
    <section className="catalog-section catalog-details" aria-labelledby={headingId}>
      <div className="catalog-heading">
        <h3 id={headingId}>Product details</h3>
        <button
          type="button"
          className="pane-close"
          aria-label="Close the details and end the selection"
          onClick={() => selectedProductStore.set(null)}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="catalog-details-body">
        <p className="catalog-name">{product.name}</p>
        <div className="catalog-tools">
          <button type="button" className="usa-button usa-button--unstyled" onClick={() => zoomToProducts(map, id)}>
            Zoom to
          </button>
          <button type="button" className="usa-button usa-button--unstyled" onClick={() => findStack(product)}>
            All dates of this frame
          </button>
        </div>
        {detail?.thumbnail ? (
          <p className="catalog-browse">
            <img src={browseAddress(id)} alt="Browse image of the product" width={100} height={100} />
            {browse ? (
              <a href={browse.url} target="_blank" rel="noreferrer">
                Browse image in full size
              </a>
            ) : null}
          </p>
        ) : null}
        <Rows rows={productRows(product)} />
        {fault ? (
          <p className="usa-error-message" role="alert">
            {fault}
          </p>
        ) : null}
        {!current ? <p role="status">Reading the record of the product.</p> : null}
        {detail ? (
          <>
            <Rows rows={recordRows(detail)} />
            <details className="catalog-more">
              <summary>Files ({detail.files.length})</summary>
              {FILE_KINDS.map(([kind, title]) => {
                const files = detail.files.filter((file) => file.kind === kind);
                return files.length === 0 ? null : (
                  <div key={kind}>
                    <h4>{title}</h4>
                    <ul className="catalog-files">
                      {files.map((file) => (
                        <li key={file.url}>
                          <a href={file.url} target="_blank" rel="noreferrer">
                            {file.name.replace(product.name, "") || file.name}
                          </a>
                          {file.size === null ? null : ` ${formatSize(file.size)}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </details>
            <details className="catalog-more">
              <summary>Attributes of the record ({detail.attributes.length})</summary>
              <Rows rows={detail.attributes.map(({ name, values }) => [name, values.join(", ")] as const)} />
            </details>
          </>
        ) : null}
      </div>
    </section>
  );
}
