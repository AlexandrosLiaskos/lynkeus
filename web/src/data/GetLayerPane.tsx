import { useEffect, useId, useState } from "react";
import { areaStore, type Area } from "../shared/area";
import { dockStore, showPane } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { ToolPane, ToolPaneGroup, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { addWhenReadyStore } from "./follow";
import {
  areaOf,
  cellLimitStore,
  coverage,
  estimate,
  formatCells,
  formatSurface,
  loadCellLimit,
  outlineArea,
  plan,
  sidesFault,
  sidesOf,
  surface,
  tooLarge,
  type Planned,
  type RequestProduct,
  type Sides,
} from "./getLayer";
import { JobFields } from "./JobFields";
import { dismissJob, isUnfinished, jobsStore, startJob, STATUS_WORDS, type Job } from "./jobs";
import { formatDay, formatSize } from "./products";
import { wordsOf } from "./service";
import { viewArea } from "./viewArea";

/** The name of the pane, which is the name of the ribbon button Get layer. */
export const GET_LAYER = "get-layer";

/** The explanation of the four fields of the area. */
const AREA_EXPLANATION =
  "The four sides are given in degrees of longitude and latitude on WGS 84. Each layer is clipped to this area.";

const NO_SIDES: Sides = { west: "", south: "", east: "", north: "" };

const SIDE_NAMES = [
  ["west", "West"],
  ["east", "East"],
  ["south", "South"],
  ["north", "North"],
] as const;

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

interface GetLayerPaneProps {
  /** The products that are selected in the list of the search. */
  products: readonly RequestProduct[];
  /** Whether the visitor is signed in to Earthdata, or null while the server has not said. */
  signedIn: boolean | null;
  /** Opens the form of Sign in. */
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
 * The form of the button Get layer, in the tool pane. The visitor chooses layers of the selected products and an
 * area, and each layer of each product is requested from NASA as one job. The foot of the pane shows the
 * progress of these jobs and their outcome; the Catalog pane lists every job and every layer of the session.
 */
export function GetLayerPane({ products, signedIn, onSignIn }: GetLayerPaneProps) {
  const map = useMap();
  const id = useId();
  const jobs = useStore(jobsStore);
  const drawn = useStore(areaStore);
  const limit = useStore(cellLimitStore);
  const addWhenReady = useStore(addWhenReadyStore);
  const [chosen, setChosen] = useState<Record<string, readonly string[] | undefined>>({});
  const [typed, setTyped] = useState<Sides | null>(null);
  const [started, setStarted] = useState<Started | null>(null);

  // The fields follow the drawn area until the visitor types in them or takes the area from a button.
  const sides = typed ?? (drawn ? sidesOf(drawn) : NO_SIDES);
  const area = areaOf(sides);
  const areaFault = sides === NO_SIDES ? null : sidesFault(sides);
  const outline = outlineArea(products.map(({ footprint }) => footprint));
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
  const ready =
    signedIn === true && planned.length > 0 && areaFault === null && outside.length === 0 && overLimit.length === 0;

  const toggle = (product: string, name: string) => {
    const names = chosen[product] ?? [];
    setChosen({
      ...chosen,
      [product]: names.includes(name) ? names.filter((other) => other !== name) : [...names, name],
    });
  };

  const take = (next: Area) => setTyped(sidesOf(next));

  const start = () => {
    const requests = planned.map(({ request }) => request);
    setStarted({ ids: [], sending: requests.length, fault: null, cancelled: false });
    void (async () => {
      const ids: string[] = [];
      let fault: string | null = null;
      for (const request of requests) {
        try {
          ids.push((await startJob(GET_LAYER, { ...request })).jobID);
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
      if (dockStore.get().tools.includes(GET_LAYER)) {
        showPane(GET_LAYER);
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
      id={GET_LAYER}
      title="Get layer"
      runLabel={planned.length > 1 ? `Get ${String(planned.length)} layers` : "Get layer"}
      onRun={start}
      ready={ready}
      run={run}
      onCancel={started && started.sending === null ? cancel : undefined}
    >
      <CellLimit />
      {signedIn === true ? null : signedIn === null ? (
        <p className="get-layer-note" role="status">
          Checking whether you are signed in to Earthdata.
        </p>
      ) : (
        <div className="get-layer-sign-in">
          <p>
            You are not signed in to Earthdata. Lynkeus requests a layer from NASA with your Earthdata Login account.
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
        products.map((product) => (
          <fieldset key={product.id} className="usa-fieldset">
            <legend className="usa-legend">Layers of {productTitle(product)}</legend>
            {product.layers.length === 0 ? (
              <p className="get-layer-note">Lynkeus receives no layer of this product.</p>
            ) : (
              product.layers.map(({ name, title }) => (
                <div key={name} className="usa-checkbox">
                  <input
                    className="usa-checkbox__input"
                    type="checkbox"
                    id={`${id}-${product.id}-${name}`}
                    checked={chosen[product.id]?.includes(name) ?? false}
                    onChange={() => toggle(product.id, name)}
                  />
                  <label className="usa-checkbox__label" htmlFor={`${id}-${product.id}-${name}`}>
                    {title}
                  </label>
                </div>
              ))
            )}
          </fieldset>
        ))
      )}

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Area</legend>
        <div className="get-layer-tools" role="group" aria-label="Take the area from">
          <button type="button" className="get-layer-tool" onClick={() => take(viewArea(map))}>
            Map view
          </button>
          <button
            type="button"
            className="get-layer-tool"
            disabled={!drawn}
            onClick={() => {
              if (drawn) {
                take(drawn);
              }
            }}
          >
            Drawn area
          </button>
          <button
            type="button"
            className="get-layer-tool"
            disabled={!outline}
            onClick={() => {
              if (outline) {
                take(outline);
              }
            }}
          >
            {products.length > 1 ? "Outline of the products" : "Outline of the product"}
          </button>
        </div>
        <div className="get-layer-sides">
          {SIDE_NAMES.map(([side, name]) => (
            <div key={side}>
              <label className="usa-label" htmlFor={`${id}-${side}`}>
                {name}
              </label>
              <input
                className="usa-input"
                id={`${id}-${side}`}
                inputMode="decimal"
                autoComplete="off"
                value={sides[side]}
                aria-describedby={`${id}-area-hint`}
                onChange={(event) => setTyped({ ...sides, [side]: event.target.value })}
              />
            </div>
          ))}
        </div>
        <p className="usa-hint get-layer-hint" id={`${id}-area-hint`}>
          {AREA_EXPLANATION}
        </p>
        {areaFault ? (
          <p className="usa-error-message" role="alert">
            {areaFault}
          </p>
        ) : null}
        {area ? <p className="get-layer-note">The area has a surface of {formatSurface(surface(area))}.</p> : null}
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
      </fieldset>

      {estimates.length > 0 ? (
        <ToolPaneGroup title="Estimate" open>
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
        </ToolPaneGroup>
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
