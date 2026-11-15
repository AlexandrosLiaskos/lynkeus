import { useId, useState } from "react";
import { addWhenReadyStore } from "../data/follow";
import { JobFields } from "../data/JobFields";
import { dismissJob, isUnfinished, jobsStore, startJob, STATUS_WORDS, type Job } from "../data/jobs";
import { layersStore } from "../data/layers";
import { formatDay } from "../data/products";
import { wordsOf } from "../data/service";
import { GET_LAYER_PANE } from "../data/state";
import { methodsStore } from "../help/state";
import { dockStore, openToolPane, showPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { describedBy, FieldError } from "../shared/field/FieldError";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { setPaneOpen } from "../shared/panes";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { Marked, plain } from "./Marked";
import { copiesOf, readingOf, referenceOf, summaryOf } from "./methods";
import { METHODS } from "./methodSheets";
import {
  accepted,
  check,
  defaultTitle,
  layerOption,
  missingOf,
  MOST_TITLE,
  NO_INPUT,
  NO_PARTNER,
  partners,
  READS,
  unnamed,
  type FinishedTool,
} from "./tools";

/**
 * The explanations of the form and of its titles. Each one shows from the button beside its title. They state
 * how the form works; what a tool computes and how its result is read stands in the section Method, in the
 * words of the method sheet.
 */
export const ABOUT = {
  tool: "The tool computes its result on the server of Lynkeus, as a job, from layers that the session has received. The Catalog pane lists the job in its section Jobs and the result in its section Layers. The section Method gives the reference of the method and how to read the result.",
  input:
    "The list holds the layers of the session that the tool reads. A layer is received from a NISAR product with Get layer.",
  first:
    "The list holds the layers of the session that the tool reads. The tool takes the layer of the earlier date first, in whichever of the two fields it stands.",
  second:
    "The list holds the layers of the same term as the first layer, from products of the same instrument, track, direction and frame. The server refuses two layers that are not on the same grid.",
  title:
    "The name under which the Catalog pane and the Contents pane list the result, of 1 to 200 characters. The form proposes a name from the input layers until the name is changed.",
  method: "What the method sheet of the tool states. The button under the list opens the sheet in the Help tab.",
} as const;

/** The layer that each tool reads, by the name that the Get layer form gives to it, in one sentence. */
export const RECEIVE: Record<FinishedTool, string> = {
  "backscatter-state": "Receive a layer Backscatter of a GCOV product with Get layer.",
  "backscatter-change":
    "Receive a layer Backscatter of two GCOV products of the same track, direction and frame with Get layer.",
  "coherence-state": "Receive a layer Coherence of a GUNW product with Get layer.",
};

/**
 * State that layers of the session do not record which layer of their product they are, and how they become
 * usable, in the words with which the server refuses such a layer.
 */
export function unnamedSentence(count: number): string {
  return count === 1
    ? "1 layer of the session does not record which layer of its product it is, so the tool does not read it. Receive it again with Get layer."
    : `${String(count)} layers of the session do not record which layer of their product they are, so the tool does not read them. Receive them again with Get layer.`;
}

/** The job that the last press of the run button started. */
export interface Started {
  /** The name of the job that the server accepted, or null. */
  id: string | null;
  /** Whether the request is being sent. */
  sending: boolean;
  /** Why the server refused the request, in its words, or null. */
  fault: string | null;
  /** Whether the visitor has cancelled the job. */
  cancelled: boolean;
}

/** Bring the Catalog pane to the front of its side. */
function showCatalog(): void {
  setPaneOpen("catalog", true);
}

/** Open the pane of Get layer. */
function openGetLayer(): void {
  openToolPane(GET_LAYER_PANE);
}

/**
 * Return what the foot of the pane shows about the job that the form started: its progress while it waits or
 * runs, and afterwards whether the result was computed and where it is. A refusal of the server, of the request
 * or of the job, is shown in the sentence of the server. `onMap` holds the identifiers of the layers that the
 * map shows.
 */
export function runOf(
  started: Started | null,
  jobs: readonly Job[],
  onMap: ReadonlySet<string> = new Set(),
): ToolPaneRun | null {
  if (!started) {
    return null;
  }
  if (started.sending) {
    return { state: "running", text: "Starting the job" };
  }
  if (started.id === null) {
    return started.fault === null ? null : { state: "error", text: started.fault };
  }
  const job = jobs.find((listed) => listed.jobID === started.id);
  if (!job) {
    return {
      state: "warning",
      text: started.cancelled ? "The job was cancelled." : "The job is no longer in the list of jobs.",
    };
  }
  if (isUnfinished(job)) {
    return { state: "running", progress: job.progress / 100, text: `${STATUS_WORDS[job.status]}. ${job.message}` };
  }
  const details = <JobFields job={job} />;
  if (job.status !== "successful") {
    return { state: "error", text: job.message, details };
  }
  const place =
    typeof job.layer === "string" && onMap.has(job.layer)
      ? "It is on the map and in the section Layers of the Catalog pane."
      : "The section Layers of the Catalog pane lists it.";
  return {
    state: "success",
    text: `The result was computed. ${place}`,
    action: { label: "Show the Catalog pane", onClick: showCatalog },
    details,
  };
}

interface LayerFieldProps {
  id: string;
  title: string;
  about: string;
  /** The layers that the field offers. */
  layers: readonly LayerDescription[];
  /** The id of the layer that is chosen, or null. */
  chosen: string | null;
  /** What is wrong with the choice, or null. It shows after the field was left. */
  fault: string | null;
  /** Whether the field cannot be used yet. */
  inactive?: boolean;
  onChoose: (layer: string | null) => void;
}

/** A field of the form that takes one layer of the session, from a list. */
function LayerField({ id, title, about, layers, chosen, fault, inactive = false, onChoose }: LayerFieldProps) {
  const [left, setLeft] = useState(false);
  const listed = layers.some((layer) => layer.id === chosen);
  const shown = left && !inactive ? fault : null;
  return (
    <>
      <FieldTitle field={id} title={title}>
        {about}
      </FieldTitle>
      <select
        className={shown ? "usa-select usa-input--error" : "usa-select"}
        id={id}
        value={listed && chosen !== null ? chosen : ""}
        disabled={inactive}
        aria-invalid={shown ? true : undefined}
        aria-describedby={describedBy(infoId(id), shown && `${id}-error`)}
        onBlur={() => setLeft(true)}
        onChange={(event) => onChoose(event.target.value === "" ? null : event.target.value)}
      >
        {listed ? null : <option value="">Select a layer</option>}
        {layers.map((layer) => (
          <option key={layer.id} value={layer.id}>
            {layerOption(layer)}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`}>{shown}</FieldError>
    </>
  );
}

/** Open the method sheet of a tool in the page Methods of the Help tab. */
function showSheet(tool: FinishedTool): void {
  methodsStore.set({ open: true, tool });
}

/**
 * What the method sheet of a tool states, in the form of the tool: the result, with the first sentences on how
 * to read it behind the "i", the reference of the method, what the tool does with the mask of the product, and
 * what the map shows of the result when it is zoomed out.
 */
export function MethodSummary({ tool }: { tool: FinishedTool }) {
  const method = METHODS[tool];
  return (
    <Section title="Method" info={ABOUT.method}>
      <PropertyList
        groups={[
          {
            rows: [
              {
                name: "Result",
                value: <Marked text={summaryOf(method, "Result")} />,
                info: plain(readingOf(method)),
              },
              { name: "Reference", value: <Marked text={referenceOf(method)} /> },
              { name: "Mask", value: <Marked text={method.mask} /> },
              { name: "Reduced copies", value: <Marked text={copiesOf(method)} /> },
            ],
          },
        ]}
      />
      <button
        type="button"
        className="usa-button usa-button--unstyled analysis-sheet-link"
        onClick={() => showSheet(tool)}
      >
        Show the method sheet
      </button>
    </Section>
  );
}

/**
 * The form of a finished analysis tool, in the tool pane: one form for all tools. The visitor chooses the input
 * layer among the layers of the session that the tool reads, or the two layers of Backscatter, Change, and the
 * name of the result, for which the form proposes one. While a choice is missing or impossible, the foot of the
 * pane states the first fault, and a field that was left states its own, with the shared `FieldError`. Without a
 * layer that the tool reads, the pane names the layer to receive and offers the Get layer form, and its foot
 * states why the run button is inactive. The run button starts the tool as a job of
 * the server; the Catalog pane lists the job and its result, and the foot shows the progress and the outcome.
 */
export function ToolForm({ tool }: { tool: FinishedTool }) {
  const id = useId();
  const entries = useStore(layersStore);
  const jobs = useStore(jobsStore);
  const mapLayers = useStore(mapLayersStore);
  const addWhenReady = useStore(addWhenReadyStore);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  // The name that the visitor gave to the result, or null while the form proposes one.
  const [own, setOwn] = useState<string | null>(null);
  const [titleLeft, setTitleLeft] = useState(false);
  const [started, setStarted] = useState<Started | null>(null);

  const method = METHODS[tool];
  const two = READS[tool].count === 2;
  const layers = entries.map((entry) => entry.layer);
  const offered = accepted(tool, layers);
  const one = offered.find((layer) => layer.id === first);
  const beside = one && two ? partners(one, layers) : [];
  const without = unnamed(tool, layers);

  // The layers are put in the order of the tool before the name is proposed from them.
  const proposed = defaultTitle(tool, check({ tool, layers, first, second, title: "" }).layers);
  const title = own ?? proposed;
  const { layers: chosen, faults, inputs } = check({ tool, layers, first, second, title });
  const missing = offered.length === 0 ? NO_INPUT : missingOf(faults);

  const start = () => {
    if (!inputs) {
      return;
    }
    setStarted({ id: null, sending: true, fault: null, cancelled: false });
    startJob(tool, { ...inputs }).then(
      (job) => {
        setStarted({ id: job.jobID, sending: false, fault: null, cancelled: false });
        // The form stays in front when the Catalog pane appears with the first job of the session.
        if (dockStore.get().tools.includes(tool)) {
          showPane(tool);
        }
      },
      (error: unknown) =>
        setStarted({
          id: null,
          sending: false,
          fault: wordsOf(error, "The job could not be started."),
          cancelled: false,
        }),
    );
  };

  const cancel = () => {
    if (!started || started.id === null) {
      return;
    }
    setStarted({ ...started, cancelled: true });
    dismissJob(started.id).catch((error: unknown) =>
      report("error", wordsOf(error, "The job could not be cancelled.")),
    );
  };

  const titleFault = titleLeft ? faults.title : null;

  return (
    <ToolPane
      id={tool}
      title={method.title}
      info={ABOUT.tool}
      onRun={start}
      ready={inputs !== null}
      missing={missing ?? undefined}
      run={runOf(started, jobs, new Set(mapLayers.map((layer) => layer.id)))}
      onCancel={started && started.id !== null ? cancel : undefined}
    >
      {offered.length === 0 ? (
        <EmptyState
          title="No input layer"
          text={RECEIVE[tool]}
          action={{ label: "Get layer", onClick: openGetLayer }}
        />
      ) : (
        <>
          <LayerField
            id={`${id}-first`}
            title={two ? "First layer" : "Input layer"}
            about={two ? ABOUT.first : ABOUT.input}
            layers={offered}
            chosen={first}
            fault={faults.first}
            onChoose={setFirst}
          />
          {two ? (
            <LayerField
              id={`${id}-second`}
              title="Second layer"
              about={ABOUT.second}
              layers={beside}
              chosen={second}
              fault={faults.second}
              inactive={!one || beside.length === 0}
              onChoose={setSecond}
            />
          ) : null}
          {one && two && beside.length === 0 ? (
            <Notice kind="info" action={{ label: "Get layer", onClick: openGetLayer }}>
              {NO_PARTNER} Receive the same layer of a product of another date, of the same track, direction and frame.
            </Notice>
          ) : null}
          {chosen.length === 2 ? (
            <PropertyList
              groups={[
                {
                  rows: chosen.map((layer, index) => ({
                    name: index === 0 ? "Earlier date" : "Later date",
                    value: layer.dates.map(formatDay).join(" and "),
                  })),
                },
              ]}
            />
          ) : null}

          <FieldTitle field={`${id}-title`} title="Name of the result">
            {ABOUT.title}
          </FieldTitle>
          <input
            className={titleFault ? "usa-input usa-input--error" : "usa-input"}
            id={`${id}-title`}
            value={title}
            maxLength={MOST_TITLE}
            autoComplete="off"
            aria-invalid={titleFault ? true : undefined}
            aria-describedby={describedBy(infoId(`${id}-title`), titleFault && `${id}-title-error`)}
            onBlur={() => setTitleLeft(true)}
            onChange={(event) => setOwn(event.target.value)}
          />
          <FieldError id={`${id}-title-error`}>{titleFault}</FieldError>

          <div className="usa-checkbox analysis-option">
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
        </>
      )}
      {without > 0 ? <Notice kind="info">{unnamedSentence(without)}</Notice> : null}
      <MethodSummary tool={tool} />
    </ToolPane>
  );
}
