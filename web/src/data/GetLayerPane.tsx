import { useEffect, useId, useState } from "react";
import { areaStore } from "../shared/area";
import { dockStore, openToolPane, showPane } from "../shared/dock/dock";
import { Info } from "../shared/info/Info";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { ToolPane, ToolPaneGroup, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { AreaFields, rectangleText } from "./AreaFields";
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
import { formatDay, formatSize } from "./products";
import { firstDraft, type SearchDraft } from "./search";
import { viewArea } from "./searchArea";
import { wordsOf } from "./service";
import { useSession, type Session } from "./session";
import { SIGN_IN_PANE } from "./SignInPane";
import { GET_LAYER_PANE, productsStore, searchDraftStore, selectedProductStore } from "./state";

/** The explanations of the tool and of its titles, one for each title. Each one shows from the button beside its title. */
export const ABOUT = {
  tool: "The tool requests layers of the selected product from NASA and receives each one clipped to the area, as a file that Lynkeus draws on the map. Each layer is one job. The Catalog pane lists the jobs and the layers. The tool needs a sign-in to Earthdata.",
  layers: "The layers of the product that Lynkeus receives. Each layer that is chosen is requested as one job.",
  area: "The area to which each layer is clipped. It is the area of the search, so a change here changes it there. A layer is received for a rectangle that meets the outline of the product. An area of polygons gives the rectangle around them.",
  estimate:
    "The largest number of cells that each layer can hold in the area, from the smallest cell size of the layer, and the size of these cells as 32-bit numbers before compression.",
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
 * Return what the foot of the pane shows about the jobs that the form started: their progress while one waits
 * or runs, and afterwards how many layers were received.
 */
export function runOf(started: Started | null, jobs: readonly Job[]): ToolPaneRun | null {
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
  const received = listed.filter((job) => job.status === "successful").length;
  if (received === ids.length) {
    return {
      state: "success",
      text: one ? "The layer was received." : `${String(received)} layers were received.`,
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
  return { state: "warning", text: parts.filter(Boolean).join(" "), details };
}

interface GetLayerFormProps {
  /** The products that are selected in the list of the search. */
  products: readonly RequestProduct[];
  /** What the page knows about the visitor's sign-in to Earthdata. */
  session: Session["state"];
  /** Opens the pane of Sign in. */
  onSignIn: () => void;
}

/** Read the limit of the server on the cells of a layer each time the pane opens. */
function CellLimit() {
  useEffect(() => {
    void loadCellLimit();
  }, []);
  return null;
}

/**
 * The form of the button Get layer, in the tool pane. The visitor chooses layers of the selected products and
 * the area, with the area control of the search, and each layer of each product is requested from NASA as one
 * job. The foot of the pane shows the progress of these jobs and their outcome; the Catalog pane lists every job
 * and every layer of the session.
 */
export function GetLayerForm({ products, session, onSignIn }: GetLayerFormProps) {
  const map = useMap();
  const id = useId();
  const jobs = useStore(jobsStore);
  const draft = useStore(searchDraftStore);
  const limit = useStore(cellLimitStore);
  const addWhenReady = useStore(addWhenReadyStore);
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
  const ready = session === "signed-in" && planned.length > 0 && outside.length === 0 && overLimit.length === 0;

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

  const run = runOf(started, jobs);

  return (
    <ToolPane
      id={GET_LAYER_PANE}
      title="Get layer"
      info={ABOUT.tool}
      runLabel={planned.length > 1 ? `Get ${String(planned.length)} layers` : "Get layer"}
      onRun={start}
      ready={ready}
      run={run}
      onCancel={started && started.sending === null ? cancel : undefined}
    >
      <CellLimit />
      {session === "signed-in" ? null : session === "unknown" ? (
        <p className="get-layer-note" role="status">
          Checking whether you are signed in to Earthdata.
        </p>
      ) : (
        <div className="get-layer-sign-in">
          <p>
            {session === "signed-out"
              ? "You are not signed in to Earthdata. Lynkeus requests a layer from NASA with your Earthdata Login account."
              : "The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata."}
          </p>
          <button type="button" className="usa-button usa-button--outline" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      )}

      {products.length === 0 ? (
        <p className="get-layer-note">
          No product is selected. Select a product in the list Products found of the Catalog pane. The button Search
          products fills that list.
        </p>
      ) : (
        products.map((product) => {
          const title = `Layers of ${productTitle(product)}`;
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
                <p className="get-layer-note">Lynkeus receives no layer of this product.</p>
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
        })
      )}

      <ToolPaneGroup title="Area" open>
        {draft ? <AreaFields draft={draft} onChange={change} explanation={ABOUT.area} /> : null}
        {areaFault ? (
          <p className="usa-error-message" role="alert">
            {areaFault}
          </p>
        ) : null}
        {area ? (
          <p className="get-layer-note">
            {around
              ? `Each layer is clipped to the rectangle around this area: west ${String(area.west)}, south ${String(area.south)}, east ${String(area.east)}, north ${String(area.north)}. The rectangle`
              : "The area"}{" "}
            has a surface of {formatSurface(surface(area))}.
          </p>
        ) : null}
        {lying.map(({ product, lies }) =>
          lies === "outside" ? (
            <p key={product.id} className="usa-error-message" role="alert">
              The area lies outside the outline of the product {productTitle(product)}.
            </p>
          ) : lies === "partly" ? (
            <p key={product.id} className="get-layer-note">
              A part of the area lies outside the outline of the product {productTitle(product)}.
            </p>
          ) : null,
        )}
      </ToolPaneGroup>

      {estimates.length > 0 ? (
        <fieldset className="usa-fieldset" aria-labelledby={`${id}-estimate`} aria-describedby={`${id}-estimate-info`}>
          <legend className="usa-legend">
            <span id={`${id}-estimate`}>Estimate</span>
            <Info id={`${id}-estimate-info`} about="Estimate">
              {ABOUT.estimate}
            </Info>
          </legend>
          <ul className="get-layer-estimates">
            {estimates.map(({ key, product, choice, cells, bytes }) => (
              <li key={key}>
                {products.length > 1 ? `${choice.title}, ${productTitle(product)}` : choice.title}: up to{" "}
                {formatCells(cells)}, up to {formatSize(bytes)} before compression
              </li>
            ))}
          </ul>
          {overLimit.map(({ key, choice, cells }) => (
            <p key={key} className="usa-error-message" role="alert">
              {tooLarge(choice.title, cells, limit ?? 0)}
            </p>
          ))}
        </fieldset>
      ) : null}

      <ToolPaneGroup title="Result" open>
        <div className="usa-checkbox">
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
      </ToolPaneGroup>

      <p className="get-layer-note" role="status">
        {layersChosen === 0
          ? "No layer is chosen."
          : !area
            ? `${String(layersChosen)} ${layersChosen === 1 ? "layer is" : "layers are"} chosen. Give the area.`
            : planned.length === 1
              ? "One job will be started."
              : `${String(planned.length)} jobs will be started, one for each layer.`}
      </p>
      {started?.fault && started.ids.length > 0 ? (
        <p className="usa-error-message" role="alert">
          {started.fault}
        </p>
      ) : null}
    </ToolPane>
  );
}

/**
 * The pane of the button Get layer. It gives the form the product that is selected in the list of the search and
 * the state of the sign-in, and its Sign in button opens the pane of the sign-in.
 */
export function GetLayerPane() {
  const session = useSession();
  const results = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const product = results?.products.find((found) => found.id === selected);
  return (
    <GetLayerForm
      products={product ? [product] : []}
      session={session.state}
      onSignIn={() => openToolPane(SIGN_IN_PANE)}
    />
  );
}
