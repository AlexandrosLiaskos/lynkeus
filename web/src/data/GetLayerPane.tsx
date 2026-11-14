import { memo, useEffect, useId, useState } from "react";
import { areaStore } from "../shared/area";
import { dockStore, openToolPane, showPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { Info } from "../shared/info/Info";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { setPaneOpen } from "../shared/panes";
import { PropertyList, type Property } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { AreaFields, rectangleText } from "./AreaFields";
import { FieldTitle, infoId } from "./FieldTitle";
import { addWhenReadyStore } from "./follow";
import {
  cellLimitStore,
  coverage,
  estimate,
  formatCells,
  formatSurface,
  loadCellLimit,
  plan,
  requestArea,
  surface,
  tooLarge,
  type Planned,
  type RequestProduct,
} from "./getLayer";
import { JobFields } from "./JobFields";
import { dismissJob, isUnfinished, jobsStore, startJob, STATUS_WORDS, type Job } from "./jobs";
import { formatDay, formatSize, type Product } from "./products";
import { firstDraft, type SearchDraft } from "./search";
import { viewArea } from "./searchArea";
import { wordsOf } from "./service";
import { useSession, type Session } from "./session";
import { SIGN_IN_PANE } from "./SignInPane";
import { GET_LAYER_PANE, productsStore, SEARCH_PANE, searchDraftStore, selectedProductStore } from "./state";

/** The explanations of the tool and of its titles, one for each title. Each one shows from the button beside its title. */
export const ABOUT = {
  tool: "The tool requests layers of a product from NASA and receives each one clipped to the area, as one job for each layer. It needs a product found with Search products and a sign-in to Earthdata. The Catalog pane lists the jobs and the layers.",
  product:
    "The product whose layers are requested. The list holds the products that the last search found. The choice is the product that is selected in the Catalog pane and on the map.",
  layers: "The layers of the product that Lynkeus receives. Each layer that is chosen is requested as one job.",
  area: "The area to which each layer is clipped. It is also the area of the search, so a change here changes it there. A layer is received for a rectangle that meets the outline of the product.",
  estimate:
    "The surface of the area and, for each chosen layer, the largest number of cells that the layer can hold in the area, from its smallest cell size. The size is the size of these cells as 32-bit numbers before compression.",
  rectangle: "A layer is received for a rectangle. An area of polygons gives the rectangle around them.",
} as const;

/** The jobs that the last press of the run button started. */
export interface Started {
  /** The names of the jobs that the server accepted. */
  ids: readonly string[];
  /** The number of requests that are being sent, or null when all have been answered. */
  sending: number | null;
  /** Why the server refused a request, in its words, or null. */
  fault: string | null;
  /** Whether the visitor has cancelled the jobs. */
  cancelled: boolean;
}

/** Name a product in one line: its type, its date or dates, and its track and frame. */
export function productTitle({ product, dates, track, frame }: RequestProduct): string {
  return `${product}, ${dates.map(formatDay).join(" and ")}, track ${String(track)}, frame ${String(frame)}`;
}

/**
 * Name a product in the list of the field Product: its date or dates, its track, its frame and the direction of
 * its orbit. The type stands first when the list holds products of several types.
 */
export function productOption({ product, dates, track, frame, direction }: Product, withType: boolean): string {
  const text = `${dates.map(formatDay).join(" and ")}, track ${String(track)}, frame ${String(frame)}, ${direction}`;
  return withType ? `${product}, ${text}` : text;
}

/** Bring the Catalog pane to the front of its side. */
function showCatalog(): void {
  setPaneOpen("catalog", true);
}

/** Open the pane of Sign in. */
function openSignIn(): void {
  openToolPane(SIGN_IN_PANE);
}

/** Open the pane of Search products. */
function openSearch(): void {
  openToolPane(SEARCH_PANE);
}

/** Select a product in the Catalog pane, on the map and in the form, or end the selection. */
function selectProduct(product: string | null): void {
  selectedProductStore.set(product);
}

/** State where the layers that were received are: on the map and in the Catalog pane, or in the Catalog pane alone. */
function placeOf(count: number, onMap: boolean): string {
  if (onMap) {
    return `${count === 1 ? "It is" : "They are"} on the map and in the section Layers of the Catalog pane.`;
  }
  return `The section Layers of the Catalog pane lists ${count === 1 ? "it" : "them"}.`;
}

/**
 * Return what the foot of the pane shows about the jobs that the form started: their progress while one waits
 * or runs, and afterwards how many layers were received and where they are. `onMap` holds the identifiers of
 * the layers that the map shows.
 */
export function runOf(
  started: Started | null,
  jobs: readonly Job[],
  onMap: ReadonlySet<string> = new Set(),
): ToolPaneRun | null {
  if (!started) {
    return null;
  }
  const { ids, sending, fault, cancelled } = started;
  if (sending !== null) {
    return { state: "running", text: sending === 1 ? "Starting the job" : `Starting ${String(sending)} jobs` };
  }
  if (ids.length === 0) {
    return fault === null ? null : { state: "error", text: fault };
  }
  const listed = ids.flatMap((id) => jobs.find((job) => job.jobID === id) ?? []);
  const [only] = listed;
  const one = ids.length === 1;
  if (listed.some(isUnfinished)) {
    const ended = listed.filter((job) => !isUnfinished(job)).length;
    return {
      state: "running",
      progress: listed.reduce((sum, job) => sum + (isUnfinished(job) ? job.progress : 100), 0) / (100 * listed.length),
      text:
        one && only
          ? `${STATUS_WORDS[only.status]}. ${only.message}`
          : `${String(ended)} of ${String(listed.length)} jobs have ended`,
    };
  }
  if (listed.length === 0 || !only) {
    const text = cancelled
      ? one
        ? "The job was cancelled."
        : "The jobs were cancelled."
      : one
        ? "The job is no longer in the list of jobs."
        : "The jobs are no longer in the list of jobs.";
    return { state: "warning", text };
  }
  const details = listed.map((job) => <JobFields key={job.jobID} job={job} />);
  const successful = listed.filter((job) => job.status === "successful");
  const received = successful.length;
  const action = { label: "Show the Catalog pane", onClick: showCatalog };
  if (received === ids.length) {
    const place = placeOf(
      received,
      successful.every(({ layer }) => typeof layer === "string" && onMap.has(layer)),
    );
    return {
      state: "success",
      text: `${one ? "The layer was received." : `${String(received)} layers were received.`} ${place}`,
      action,
      details,
    };
  }
  if (received === 0 && listed.length === ids.length) {
    return { state: "error", text: one ? only.message : `All ${String(ids.length)} jobs failed.`, details };
  }
  const failed = listed.length - received;
  const gone = ids.length - listed.length;
  const parts = [
    `${String(received)} of ${String(ids.length)} layers were received.`,
    failed === 0 ? null : `${String(failed)} ${failed === 1 ? "job" : "jobs"} failed.`,
    gone === 0 ? null : `${String(gone)} ${gone === 1 ? "job is" : "jobs are"} no longer in the list of jobs.`,
  ];
  return {
    state: "warning",
    text: parts.filter(Boolean).join(" "),
    ...(received > 0 ? { action } : {}),
    details,
  };
}

/** What the form holds at one moment, as far as it decides whether the tool can run. */
export interface Needs {
  /** What the page knows about the visitor's sign-in to Earthdata. */
  session: Session["state"];
  /** The number of products that the last search found. */
  found: number;
  /** The number of products that are selected. */
  products: number;
  /** The number of layers that Lynkeus receives of the selected products. */
  offered: number;
  /** The number of layers that are chosen. */
  chosen: number;
  /** Whether the area gives a rectangle to which a layer can be clipped. */
  area: boolean;
  /** Whether the area lies outside the outline of a product of which a layer is chosen. */
  outside: boolean;
  /** Whether a chosen layer would hold more cells than the server receives. */
  tooLarge: boolean;
}

/**
 * Return the first thing that the tool still lacks, in one sentence, or null when it can run. The order is the
 * order in which the visitor provides them: the sign-in, the product, the layer and the area.
 */
export function missingOf(needs: Needs): string | null {
  if (needs.session === "unknown") {
    return "The sign-in to Earthdata is being checked.";
  }
  if (needs.session === "unreachable") {
    return "The sign-in to Earthdata is not known.";
  }
  if (needs.session === "signed-out") {
    return "Sign in to Earthdata.";
  }
  if (needs.found === 0) {
    return "Search for products.";
  }
  if (needs.products === 0) {
    return "Select a product.";
  }
  if (needs.offered === 0) {
    return "Select a product of which Lynkeus receives a layer.";
  }
  if (needs.chosen === 0) {
    return "Choose a layer.";
  }
  if (!needs.area) {
    return "Give the area.";
  }
  if (needs.outside) {
    return "Choose an area inside the outline of the product.";
  }
  if (needs.tooLarge) {
    return "Choose a smaller area.";
  }
  return null;
}

interface SignInNoticeProps {
  session: Session["state"];
  onSignIn: () => void;
}

/** The state of the sign-in to Earthdata for a visitor who is not signed in, with the button that opens the pane of Sign in. */
function SignInNotice({ session, onSignIn }: SignInNoticeProps) {
  if (session === "signed-in") {
    return null;
  }
  if (session === "unknown") {
    return <Notice kind="info">Checking whether you are signed in to Earthdata.</Notice>;
  }
  return (
    <Notice kind="warning" action={{ label: "Sign in", onClick: onSignIn }}>
      {session === "signed-out"
        ? "You are not signed in to Earthdata. A layer is requested from NASA with your Earthdata account."
        : "The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata."}
    </Notice>
  );
}

interface ProductFieldProps {
  id: string;
  found: readonly Product[];
  selected: string | null;
  onSelect: (product: string | null) => void;
}

/**
 * The field Product: the list of the products that the last search found. It is drawn again only when the list
 * or the selection changes, because the list may hold some thousand products.
 */
const ProductField = memo(function ProductField({ id, found, selected, onSelect }: ProductFieldProps) {
  const withType = new Set(found.map(({ product }) => product)).size > 1;
  const listed = found.some((product) => product.id === selected);
  return (
    <>
      <FieldTitle field={id} title="Product">
        {ABOUT.product}
      </FieldTitle>
      <select
        className="usa-select"
        id={id}
        aria-describedby={infoId(id)}
        value={listed && selected !== null ? selected : ""}
        onChange={(event) => onSelect(event.target.value === "" ? null : event.target.value)}
      >
        {listed ? null : <option value="">Select a product</option>}
        {found.map((product) => (
          <option key={product.id} value={product.id}>
            {productOption(product, withType)}
          </option>
        ))}
      </select>
    </>
  );
});

interface GetLayerFormProps {
  /** The products that the last search found. The field Product lists them. */
  found: readonly Product[];
  /** The identifier of the product that is selected, or null. */
  selected: string | null;
  /** The products whose layers are requested: the selected product, or none. */
  products: readonly RequestProduct[];
  /** What the page knows about the visitor's sign-in to Earthdata. */
  session: Session["state"];
  /** Opens the pane of Sign in. */
  onSignIn: () => void;
  /** Opens the pane of Search products. */
  onSearch: () => void;
  /** Selects a product, or ends the selection. */
  onSelect: (product: string | null) => void;
}

/** Read the limit of the server on the cells of a layer each time the pane opens. */
function CellLimit() {
  useEffect(() => {
    void loadCellLimit();
  }, []);
  return null;
}

/**
 * The form of the button Get layer, in the tool pane. Before a search has found a product, the pane says so and
 * offers the button Search products. Afterwards the visitor selects a product, chooses its layers and gives the
 * area, with the area control of the search, and each layer of each product is requested from NASA as one job.
 * While the tool cannot run, the foot of the pane states the first thing that is missing. During and after a
 * run it shows the progress of the jobs and their outcome; the Catalog pane lists every job and every layer of
 * the session.
 */
export function GetLayerForm({ found, selected, products, session, onSignIn, onSearch, onSelect }: GetLayerFormProps) {
  const map = useMap();
  const id = useId();
  const jobs = useStore(jobsStore);
  const draft = useStore(searchDraftStore);
  const limit = useStore(cellLimitStore);
  const addWhenReady = useStore(addWhenReadyStore);
  const mapLayers = useStore(mapLayersStore);
  const [chosen, setChosen] = useState<Record<string, readonly string[] | undefined>>({});
  const [started, setStarted] = useState<Started | null>(null);

  // The area is the one of the search. Before the search pane was first opened, it starts as there: with the
  // area of the Map tab or, without one, with the view of the map.
  useEffect(() => {
    if (searchDraftStore.get() === null) {
      searchDraftStore.set(firstDraft(rectangleText(areaStore.get() ?? viewArea(map))));
    }
  }, [map]);

  const change = (changes: Partial<SearchDraft>) => {
    const current = searchDraftStore.get();
    if (current) {
      searchDraftStore.set({ ...current, ...changes });
    }
  };

  const { area, fault: areaFault, around } = draft ? requestArea(draft) : { area: null, fault: null, around: false };
  const planned: Planned[] = area ? plan(products, chosen, area) : [];
  const layersChosen = products.reduce(
    (count, { id: product, layers }) => count + layers.filter(({ name }) => chosen[product]?.includes(name)).length,
    0,
  );
  const lying = area ? products.map((product) => ({ product, lies: coverage(area, product.footprint) })) : [];
  const outside = lying.filter(({ product, lies }) => lies === "outside" && (chosen[product.id]?.length ?? 0) > 0);
  const estimates = planned.flatMap(({ request, product, choice }) => {
    const size = estimate(request.area, choice);
    return size ? [{ key: `${product.id} ${choice.name}`, product, choice, ...size }] : [];
  });
  const overLimit = limit === null ? [] : estimates.filter(({ cells }) => cells > limit);
  const missing = missingOf({
    session,
    found: found.length,
    products: products.length,
    offered: products.reduce((count, { layers }) => count + layers.length, 0),
    chosen: layersChosen,
    area: area !== null,
    outside: outside.length > 0,
    tooLarge: overLimit.length > 0,
  });

  // A product is named in a sentence only when the form holds several.
  const several = products.length > 1;
  const named = (product: RequestProduct) => (several ? `the product ${productTitle(product)}` : "the product");
  const outsideFault = lying
    .filter(({ lies }) => lies === "outside")
    .map(({ product }) => `The area lies outside the outline of ${named(product)}.`)
    .join(" ");

  const toggle = (product: string, name: string) => {
    const names = chosen[product] ?? [];
    setChosen({
      ...chosen,
      [product]: names.includes(name) ? names.filter((other) => other !== name) : [...names, name],
    });
  };

  const start = () => {
    const requests = planned.map(({ request }) => request);
    setStarted({ ids: [], sending: requests.length, fault: null, cancelled: false });
    void (async () => {
      const ids: string[] = [];
      let fault: string | null = null;
      for (const request of requests) {
        try {
          ids.push((await startJob(GET_LAYER_PANE, { ...request })).jobID);
        } catch (error) {
          fault = wordsOf(error, "The job could not be started.");
          break;
        }
      }
      if (fault !== null && requests.length > 1) {
        fault = `${String(ids.length)} of ${String(requests.length)} jobs were started. ${fault}`;
      }
      setStarted({ ids, sending: null, fault, cancelled: false });
      // The form stays in front when the Catalog pane appears with the first job of the session.
      if (dockStore.get().tools.includes(GET_LAYER_PANE)) {
        showPane(GET_LAYER_PANE);
      }
    })();
  };

  const cancel = () => {
    if (!started) {
      return;
    }
    setStarted({ ...started, cancelled: true });
    for (const job of jobs) {
      if (started.ids.includes(job.jobID) && isUnfinished(job)) {
        dismissJob(job.jobID).catch((error: unknown) =>
          report("error", wordsOf(error, "The job could not be cancelled.")),
        );
      }
    }
  };

  const run = runOf(started, jobs, new Set(mapLayers.map((layer) => layer.id)));

  const estimateRows: Property[] = area
    ? [
        ...(around
          ? [
              {
                name: "Rectangle",
                value: `West ${String(area.west)}, south ${String(area.south)}, east ${String(area.east)}, north ${String(area.north)} (degrees)`,
                info: ABOUT.rectangle,
              },
            ]
          : []),
        { name: "Surface", value: formatSurface(surface(area)) },
        ...estimates.map(({ product, choice, cells, bytes }) => ({
          name: several ? `${choice.title}, ${productTitle(product)}` : choice.title,
          value: `Up to ${formatCells(cells)}, ${formatSize(bytes)}`,
        })),
      ]
    : [];

  return (
    <ToolPane
      id={GET_LAYER_PANE}
      title="Get layer"
      info={ABOUT.tool}
      runLabel={planned.length > 1 ? `Get ${String(planned.length)} layers` : "Get layer"}
      onRun={start}
      ready={missing === null}
      missing={missing ?? undefined}
      run={run}
      onCancel={started && started.sending === null ? cancel : undefined}
    >
      <CellLimit />
      <SignInNotice session={session} onSignIn={onSignIn} />

      {found.length === 0 ? (
        <EmptyState
          title="No product is selected"
          text="A layer is requested from a product that a search of NASA's catalogue has found."
          action={{ label: "Search products", onClick: onSearch }}
        />
      ) : (
        <>
          <ProductField id={`${id}-product`} found={found} selected={selected} onSelect={onSelect} />

          {products.map((product) => {
            const title = several ? `Layers of ${productTitle(product)}` : "Layers";
            const group = `${id}-${product.id}`;
            return (
              <fieldset
                key={product.id}
                className="usa-fieldset"
                aria-labelledby={`${group}-title`}
                aria-describedby={`${group}-info`}
              >
                <legend className="usa-legend">
                  <span id={`${group}-title`}>{title}</span>
                  <Info id={`${group}-info`} about={title}>
                    {ABOUT.layers}
                  </Info>
                </legend>
                {product.layers.length === 0 ? (
                  <Notice kind="info">Lynkeus receives no layer of this product.</Notice>
                ) : (
                  product.layers.map(({ name, title: layer }) => (
                    <div key={name} className="usa-checkbox">
                      <input
                        className="usa-checkbox__input"
                        type="checkbox"
                        id={`${group}-${name}`}
                        checked={chosen[product.id]?.includes(name) ?? false}
                        onChange={() => toggle(product.id, name)}
                      />
                      <label className="usa-checkbox__label" htmlFor={`${group}-${name}`}>
                        {layer}
                      </label>
                    </div>
                  ))
                )}
              </fieldset>
            );
          })}

          {draft ? (
            <AreaFields
              draft={draft}
              onChange={change}
              explanation={ABOUT.area}
              fault={areaFault ?? (outsideFault === "" ? null : outsideFault)}
            />
          ) : null}
          {lying.map(({ product, lies }) =>
            lies === "partly" ? (
              <Notice key={product.id} kind="warning">
                A part of the area lies outside the outline of {named(product)}.
              </Notice>
            ) : null,
          )}

          <div className="usa-checkbox data-option">
            <input
              className="usa-checkbox__input"
              type="checkbox"
              id={`${id}-add`}
              checked={addWhenReady}
              onChange={(event) => addWhenReadyStore.set(event.target.checked)}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-add`}>
              Add to the map when ready
            </label>
          </div>

          {started?.fault && started.ids.length > 0 ? <Notice kind="error">{started.fault}</Notice> : null}

          {estimateRows.length > 0 ? (
            <Section title="Estimate" info={ABOUT.estimate}>
              <PropertyList groups={[{ rows: estimateRows }]} />
              {overLimit.map(({ key, choice, cells }) => (
                <p key={key} className="usa-error-message" role="alert">
                  {tooLarge(choice.title, cells, limit ?? 0)}
                </p>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </ToolPane>
  );
}

/**
 * The pane of the button Get layer. It gives the form the products that the last search found, the product that
 * is selected among them and the state of the sign-in. The field Product of the form selects a product as the
 * Catalog pane and the map do, and its buttons open the panes of Search products and of Sign in.
 */
export function GetLayerPane() {
  const session = useSession();
  const results = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const found = results?.products ?? [];
  const product = found.find((other) => other.id === selected);
  return (
    <GetLayerForm
      found={found}
      selected={selected}
      products={product ? [product] : []}
      session={session.state}
      onSignIn={openSignIn}
      onSearch={openSearch}
      onSelect={selectProduct}
    />
  );
}
