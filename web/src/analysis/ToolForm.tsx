// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useState } from "react";
import { addWhenReadyStore } from "../data/follow";
import { JobFields } from "../data/JobFields";
import { dismissJob, isUnfinished, jobsStore, startJob, STATUS_WORDS, type Job } from "../data/jobs";
import { layersStore } from "../data/layers";
import { SignInCancelled, wordsOf } from "../data/service";
import { GET_LAYER_PANE } from "../data/state";
import { methodsStore } from "../help/state";
import { ServerField, useServerChoice } from "../servers/ServerField";
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
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { rowOf } from "./methods";
import { METHODS } from "./methodSheets";
import {
  accepted,
  besideOf,
  check,
  comparisonOf,
  datesWords,
  defaultTitle,
  layerOption,
  missingOf,
  MOST_TITLE,
  NO_COMPONENTS,
  NO_INPUT,
  NO_OTHER_PAIR,
  NO_PARTNER,
  READS,
  unnamed,
  type Comparison,
  type FinishedTool,
} from "./tools";

/** The explanations of the titles of the form. Each one shows from the button beside its title. */
export const ABOUT = {
  layer: "A layer that this session received with Get layer.",
  pair: "The same layer of two dates of one track and frame; the earlier date is taken first.",
  pairs:
    "The same coherence layer of two pairs of dates of one track and frame, which span the same number of days; the earlier pair is taken first.",
  phase:
    "An Unwrapped phase layer of a GUNW product, which holds the change of the distance to the radar between the two dates as an angle.",
  components:
    "The Connected components layer of the same product, channel and area, which marks the cells where the unwrapped phase is unreliable.",
  title: "The name of the result in the Catalog and Contents panes.",
} as const;

/** The layer to get for each tool, by the name that the Get layer form gives to it. */
export const RECEIVE: Record<FinishedTool, string> = {
  "backscatter-state": "Get a Backscatter layer of a GCOV product.",
  "backscatter-change": "Get the same Backscatter layer of two GCOV products of one track and frame.",
  "coherence-state": "Get a Coherence layer of a GUNW product.",
  "coherence-change": "Get the same Coherence layer of two GUNW products of one track and frame.",
  "displacement-state":
    "Get the Unwrapped phase layer and the Connected components layer of one GUNW product, for the same area.",
  "soil-moisture-state": "Get the Soil moisture layer of an SME2 product.",
  "soil-moisture-change": "Get the Soil moisture layer of two SME2 products of one track and frame.",
};

/** What the form states when no layer of the session can stand beside the first layer of a tool of two dates. */
export const GET_PARTNER = `${NO_PARTNER} Get the same layer of another date of the same track and frame.`;

/** The same statement for Coherence, Change, which compares two pairs of dates. */
export const GET_OTHER_PAIR = `${NO_OTHER_PAIR} Get the same layer of another pair of dates of the same track and frame.`;

/** What the form states when the session holds no layer that can stand beside the first of Surface displacement, One pair. */
export const GET_COMPONENTS = `${NO_COMPONENTS} Get the Connected components layer of the same product, channel and area.`;

/** The words of the second field of a tool that compares, by what the tool compares. */
export const SECOND: Record<Comparison, { title: string; about: string; get: string }> = {
  dates: { title: "Layer of the other date", about: ABOUT.pair, get: GET_PARTNER },
  pairs: { title: "Layer of the other pair", about: ABOUT.pairs, get: GET_OTHER_PAIR },
};

/**
 * The words of the two fields of Surface displacement, One pair, whose inputs are two layers of one product: the
 * title and the explanation of the first field, and the words of the second.
 */
export const OF_ONE_PRODUCT = {
  first: { title: "Unwrapped phase", about: ABOUT.phase },
  second: { title: "Connected components", about: ABOUT.components, get: GET_COMPONENTS },
} as const;

/**
 * State that layers of the session cannot be used, and how they become usable. They are the layers whose
 * description does not record which layer of their product they are; the server refuses such a layer.
 */
export function unnamedSentence(count: number): string {
  return count === 1
    ? "1 older layer of this session cannot be used. Get it again with Get layer."
    : `${String(count)} older layers of this session cannot be used. Get them again with Get layer.`;
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
      ? "It is on the map and under Layers in the Catalog pane."
      : "It is under Layers in the Catalog pane.";
  return {
    state: "success",
    text: `The result is ready. ${place}`,
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

/** Open the page Methods of the Help tab at a tool. */
function showMethod(tool: FinishedTool): void {
  methodsStore.set({ open: true, tool });
}

/**
 * The form of a finished analysis tool, in the tool pane: one form for all tools. It shows the field of the
 * layer, or the two fields of a tool that compares two dates or two pairs of dates, with the dates in their
 * order, the name of the result, for which the form proposes one, and the box that adds the result to the map.
 * The second field offers the layers that can stand beside the first, and states in one sentence why the tool
 * does not compare the two layers that are chosen. Surface displacement, One pair has two fields as well, for
 * two layers of one product, and no row of dates. The "i" of the pane states what
 * the tool shows, and the link Method at the foot opens the page Methods at the tool. While a choice is missing
 * or impossible, the foot of the pane states the first fault, and a field that was left states its own, with the
 * shared `FieldError`. Without a layer that the tool reads, the pane names the layer to get and offers the Get
 * layer form. A visitor who has an own server chooses the server of the job in the field Server, which stands
 * before the box and knows on which server the chosen layers are kept. The run button starts the tool as a job
 * of that server, and the foot shows the progress and the outcome.
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
  const comparison = comparisonOf(tool);
  // The two inputs of the tool are two layers of one product, and not one layer of two dates or pairs.
  const ofOneProduct = READS[tool].beside !== undefined;
  const words = ofOneProduct ? OF_ONE_PRODUCT.second : comparison === null ? null : SECOND[comparison];
  const layers = entries.map((entry) => entry.layer);
  const offered = accepted(tool, layers);
  const one = offered.find((layer) => layer.id === first);
  const beside = one && words ? besideOf(tool, one, layers) : [];
  const without = unnamed(tool, layers);

  // The layers are put in the order of the tool before the name is proposed from them.
  const proposed = defaultTitle(tool, check({ tool, layers, first, second, title: "" }).layers);
  const title = own ?? proposed;
  const { layers: chosen, faults, inputs } = check({ tool, layers, first, second, title });
  // The server is the last thing that the form asks for, so what it lacks is stated last.
  const ids = chosen.map((layer) => layer.id);
  const server = useServerChoice(ids);
  const missing = offered.length === 0 ? NO_INPUT : (missingOf(faults) ?? server.missing);

  const start = () => {
    if (!inputs || server.missing !== null) {
      return;
    }
    const before = started;
    setStarted({ id: null, sending: true, fault: null, cancelled: false });
    // A request that the server refuses because it needs the token waits for the sign-in, and is then sent
    // again with the same values.
    startJob(tool, { ...inputs }, server.parameter).then(
      (job) => {
        setStarted({ id: job.jobID, sending: false, fault: null, cancelled: false });
        // The form stays in front when the Catalog pane appears with the first job of the session.
        if (dockStore.get().tools.includes(tool)) {
          showPane(tool);
        }
      },
      (error: unknown) =>
        // A visitor who gave the sign-in up finds the form as it was.
        setStarted(
          error instanceof SignInCancelled
            ? before
            : { id: null, sending: false, fault: wordsOf(error, "The job could not be started."), cancelled: false },
        ),
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
      info={rowOf(method, "What it shows")}
      secondary={{ label: "Method", onClick: () => showMethod(tool) }}
      onRun={start}
      ready={inputs !== null && server.missing === null}
      missing={missing ?? undefined}
      run={runOf(started, jobs, new Set(mapLayers.map((layer) => layer.id)))}
      onCancel={started && started.id !== null ? cancel : undefined}
    >
      {offered.length === 0 ? (
        <EmptyState
          title="No layer to use"
          text={RECEIVE[tool]}
          action={{ label: "Get layer", onClick: openGetLayer }}
        />
      ) : (
        <>
          <LayerField
            id={`${id}-first`}
            title={ofOneProduct ? OF_ONE_PRODUCT.first.title : "Layer"}
            about={ofOneProduct ? OF_ONE_PRODUCT.first.about : words ? words.about : ABOUT.layer}
            layers={offered}
            chosen={first}
            fault={faults.first}
            onChoose={setFirst}
          />
          {words ? (
            <LayerField
              id={`${id}-second`}
              title={words.title}
              about={words.about}
              layers={beside}
              chosen={second}
              fault={faults.second}
              inactive={!one || beside.length === 0}
              onChoose={setSecond}
            />
          ) : null}
          {one && words && beside.length === 0 ? (
            <Notice kind="info" action={{ label: "Get layer", onClick: openGetLayer }}>
              {words.get}
            </Notice>
          ) : null}
          {chosen.length === 2 && comparison !== null ? (
            <PropertyList groups={[{ rows: [{ name: "Dates", value: datesWords(tool, chosen) }] }]} />
          ) : null}

          <FieldTitle field={`${id}-title`} title="Result name">
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

          <ServerField inputs={ids} />

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
    </ToolPane>
  );
}
