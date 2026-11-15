import { useEffect, useRef, useState } from "react";
import {
  browseAddress,
  findProduct,
  formatSize,
  type Product,
  type ProductDetail,
  type ProductFile,
} from "../data/products";
import { zoomToProducts } from "../data/Footprints";
import { findStack } from "../data/run";
import { GET_LAYER_PANE } from "../data/state";
import { copyText } from "../shared/clipboard";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { COPIED_TIME, PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { IconButton } from "../shared/toolbar/IconButton";
import { attributeRows, otherIdentifiers, productGroups } from "./productProperties";

/** The kinds of file of a product, in the order shown, with the words that name them. */
const FILE_KINDS: readonly (readonly [ProductFile["kind"], string])[] = [
  ["data", "Product file"],
  ["browse", "Browse images"],
  ["quality", "Quality reports"],
  ["metadata", "Metadata"],
];

/** The name of a product, with a button that copies it. The button states for a moment that the name was copied. */
function ProductName({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    copyText(name).then(
      () => {
        window.clearTimeout(timer.current);
        setCopied(true);
        timer.current = window.setTimeout(() => setCopied(false), COPIED_TIME);
      },
      () => report("error", "The browser did not allow the copy. Select the name and copy it with the keyboard."),
    );
  };

  return (
    <div className="catalog-name">
      <h4 className="catalog-name-text">{name}</h4>
      <IconButton icon={copied ? "check" : "content_copy"} label="Copy the product name" onClick={copy} />
      {copied ? (
        <span className="catalog-copied" role="status">
          Copied
        </span>
      ) : null}
    </div>
  );
}

/** The files of a product under the headings of their kinds. Each file is a link to its address, with its size. */
function ProductFiles({ product, files }: { product: Product; files: readonly ProductFile[] }) {
  return (
    <>
      {FILE_KINDS.map(([kind, title]) => {
        const members = files.filter((file) => file.kind === kind);
        return members.length === 0 ? null : (
          <div key={kind} className="catalog-files">
            <h4 className="catalog-files-title">{title}</h4>
            <ul className="catalog-files-list">
              {members.map((file) => (
                <li key={file.url}>
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.name.replace(product.name, "") || file.name}
                  </a>
                  {file.size === null ? null : <span className="catalog-files-size"> {formatSize(file.size)}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** The record of a product as the server sent it, or the words of the failure to receive it. */
type Loaded = { key: string; detail: ProductDetail } | { key: string; fault: string };

interface ProductDetailsProps {
  product: Product;
  /** Called by the link that returns to the list of products. */
  onBack: () => void;
}

/**
 * The details of one product, shown in the place of the list of products: the link back to the list, the name
 * of the product, its browse image, its commands and its properties in groups. The files of the product, the
 * attributes of its record and the identifiers without a readable name stand in sections that start closed.
 * The properties that the result list knows show at once, and those of the full record when the server has
 * sent it.
 */
export function ProductDetails({ product, onBack }: ProductDetailsProps) {
  const map = useMap();
  const back = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The number of the reading of the record: the button of a failed reading asks for the next one.
  const [reading, setReading] = useState(0);
  const { id } = product;
  const key = `${id} ${String(reading)}`;

  // The details take the keyboard focus from the list that they replace.
  useEffect(() => {
    back.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    findProduct(id, controller.signal)
      .then((detail) => setLoaded({ key, detail }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, fault: error instanceof Error ? error.message : "The record could not be read." });
        }
      });
    return () => controller.abort();
  }, [id, key]);

  // The record of the product that was shown before, or of a reading before, is not shown for this one.
  const current = loaded?.key === key ? loaded : null;
  const detail = current && "detail" in current ? current.detail : null;
  const fault = current && "fault" in current ? current.fault : null;
  const browse = detail?.files.find((file) => file.kind === "browse" && !file.name.endsWith("thumbnail.png"));
  const others = detail ? otherIdentifiers(detail) : [];

  return (
    <div className="catalog-details">
      <button ref={back} type="button" className="usa-button usa-button--unstyled catalog-back" onClick={onBack}>
        <Icon name="arrow_back" />
        Back to products
      </button>
      <ProductName name={product.name} />
      {detail?.thumbnail ? (
        <p className="catalog-browse">
          <img src={browseAddress(id)} alt="Browse image of the product" width={100} height={100} />
          {browse ? (
            <a href={browse.url} target="_blank" rel="noreferrer">
              Image in full size (opens in a new tab)
            </a>
          ) : null}
        </p>
      ) : null}
      <div className="catalog-commands" role="group" aria-label="Commands of the product">
        <button type="button" className="usa-button" onClick={() => openToolPane(GET_LAYER_PANE)}>
          Get layer
        </button>
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => zoomToProducts(map, id)}>
          Zoom to
        </button>
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => findStack(product)}>
          All dates of this frame
        </button>
      </div>
      {fault ? (
        <Notice kind="error" action={{ label: "Read again", onClick: () => setReading(reading + 1) }}>
          {fault}
        </Notice>
      ) : null}
      {current ? null : (
        <p className="catalog-note" role="status">
          Reading the record of the product.
        </p>
      )}
      <PropertyList groups={productGroups(product, detail)} />
      {detail ? (
        <>
          <Section
            title="Files"
            count={detail.files.length}
            defaultOpen={false}
            info="The files of the product, with their addresses at the Alaska Satellite Facility. The product file is downloaded with an Earthdata account."
          >
            <ProductFiles product={product} files={detail.files} />
          </Section>
          <Section
            title="Record attributes"
            count={detail.attributes.length}
            defaultOpen={false}
            info="The additional attributes of the record, under the names that NASA's catalogue gives them."
          >
            <PropertyList groups={[{ rows: attributeRows(detail.attributes) }]} />
          </Section>
          {others.length === 0 ? null : (
            <Section
              title="Other identifiers"
              count={others.length}
              defaultOpen={false}
              info="Identifiers of the processing, under the names that the record gives them."
            >
              <PropertyList groups={[{ rows: attributeRows(others) }]} />
            </Section>
          )}
        </>
      ) : null}
    </div>
  );
}
