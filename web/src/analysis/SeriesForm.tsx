// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useState } from "react";
import { JobFields } from "../data/JobFields";
import { dismissJob, isUnfinished, jobsStore, startJob, STATUS_WORDS, type Job } from "../data/jobs";
import { layersStore } from "../data/layers";
import { seriesStore, showSeries } from "../data/series";
import { wordsOf } from "../data/service";
import { GET_LAYER_PANE } from "../data/state";
import { methodsStore } from "../help/state";
import { dockStore, openToolPane, showPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { describedBy, FieldError } from "../shared/field/FieldError";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Info } from "../shared/info/Info";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { setPaneOpen } from "../shared/panes";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { rowOf } from "./methods";
import { METHODS } from "./methodSheets";
import {
  checkSeries,
  firstChoice,
  isRelative,
  missingOfSeries,
  NO_LAYERS,
  PLACES,
  READS_AS,
  seriesGroups,
  seriesTitle,
  type Place,
  type SeriesTool,
} from "./series";
import type { Started } from "./ToolForm";
import { accepted, MOST_TITLE } from "./tools";

/** The explanations of the titles of the form. Each one is one sentence and shows from the button beside its title. */
export const ABOUT_SERIES = {
  group:
    "The layer of the product, with the track, the frame, the direction of the orbit and the release of its products.",
  layers: "The same layer of two or more dates, received with Get layer and kept on the project server.",
  place: "The series gives the mean of the whole area of the layers, or the value of the cell that holds a point.",
  latitude: "The latitude of the point in degrees, as 42.8 or 42.8 N or 42° 48′ 30″ N.",
  longitude: "The longitude of the point in degrees, as -70.9 or 70.9 W or 70° 54′ 00″ W.",
  title: "The name of the series in the Catalog pane.",
} as const;

/**
 * The explanations of the titles of the form of Surface displacement, Series that differ from those of the other
 * Series tools. Each one is one sentence.
 */
export const ABOUT_RELATIVE = {
  layers:
    "The Unwrapped phase layers of two or more pairs of dates, each with the Connected components layer of its product in the session.",
  referenceLatitude: "The latitude of the reference point, on ground that you take as not moving, in degrees.",
  referenceLongitude: "The longitude of the reference point, on ground that you take as not moving, in degrees.",
} as const;

/** The layers to get for each tool, by the name that the Get layer form gives to them. */
export const RECEIVE_SERIES: Record<SeriesTool, string> = {
  "backscatter-series": "Get the same Backscatter layer of two or more GCOV products of one track and frame.",
  "coherence-series": "Get the same Coherence layer of two or more GUNW products of one track and frame.",
  "displacement-series":
    "Get the Unwrapped phase and Connected components layers of two or more GUNW pairs of one track and frame.",
};

/**
 * State that layers which an own server of the visitor keeps cannot be used, and how they become usable. The
 * server computes a series on the project server only.
 */
export function ownServerSentence(count: number): string {
  return count === 1
    ? "1 layer is kept on your server and cannot be used. A series is computed on the project server, so get the layer there."
    : `${String(count)} layers are kept on your servers and cannot be used. A series is computed on the project server, so get the layers there.`;
}

/** Bring the Catalog pane to the front of its side. */
function showCatalog(): void {
  setPaneOpen("catalog", true);
}

/**
 * Return what the foot of the pane shows about the job that the form started: its progress while it waits or
 * runs, and afterwards that the series is ready, with the link that shows it. A refusal of the server, of the
 * request or of the job, is shown in the sentence of the server. `listed` holds the names of the series of the
 * session that the page has read.
 */
export function seriesRunOf(
  started: Started | null,
  jobs: readonly Job[],
  listed: ReadonlySet<string> = new Set(),
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
  const job = jobs.find((other) => other.jobID === started.id);
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
  const { series } = job;
  return typeof series === "string" && listed.has(series)
    ? {
        state: "success",
        text: "The series is ready. It is under Series in the Catalog pane.",
        action: { label: "Show the series", onClick: () => showSeries(series) },
        details,
      }
    : {
        state: "success",
        text: "The series is ready. It is under Series in the Catalog pane.",
        action: { label: "Show the Catalog pane", onClick: showCatalog },
        details,
      };
}

/** Open the page Methods of the Help tab at a tool. */
function showMethod(tool: SeriesTool): void {
  methodsStore.set({ open: true, tool });
}

/** Open the pane of Get layer. */
function openGetLayer(): void {
  openToolPane(GET_LAYER_PANE);
}

/**
 * The form of a finished tool of the kind Series, in the tool pane: one form for the three tools. It shows the
 * layers that the tool can read together, each with a box, the choice between the whole area and a point, the
 * latitude and the longitude of the point, typed in degrees as in the pane Go to coordinates, and the name of
 * the series, for which the form proposes one. When the session holds more than one group of layers that can
 * stand in one series, the field Layer chooses the group. The form has no field Server and no box that adds the
 * result to the map: a series is computed on the project server, from layers that the project server keeps, and
 * it is a chart and not a layer. The "i" of the pane states what the tool shows, and the link Method at the foot
 * opens the page Methods at the tool. While a choice is missing, the foot of the pane states the first fault,
 * and a field that was left states its own. The run button starts the tool as a job, and the foot shows the
 * progress and the outcome, with the link that shows the series. The form of Surface displacement, Series has no
 * choice of the place, because its series is that of a point, and it has the latitude and the longitude of the
 * reference point after those of the point; it sends beside each chosen layer the Connected components layer of
 * its product.
 */
export function SeriesForm({ tool }: { tool: SeriesTool }) {
  const id = useId();
  const entries = useStore(layersStore);
  const jobs = useStore(jobsStore);
  const series = useStore(seriesStore);
  // The key of the group that the visitor chose, or null while the form shows the first group.
  const [wanted, setWanted] = useState<string | null>(null);
  // The layers that the visitor chose, or null while the form proposes every layer of the group.
  const [picked, setPicked] = useState<readonly string[] | null>(null);
  const [place, setPlace] = useState<Place>("area");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [baseLatitude, setBaseLatitude] = useState("");
  const [baseLongitude, setBaseLongitude] = useState("");
  // The name that the visitor gave to the series, or null while the form proposes one.
  const [own, setOwn] = useState<string | null>(null);
  const [left, setLeft] = useState({
    layers: false,
    latitude: false,
    longitude: false,
    referenceLatitude: false,
    referenceLongitude: false,
    title: false,
  });
  const [started, setStarted] = useState<Started | null>(null);

  const method = METHODS[tool];
  const relative = isRelative(tool);
  const kept = entries.filter((entry) => entry.server === null).map((entry) => entry.layer);
  const elsewhere = accepted(
    READS_AS[tool],
    entries.filter((entry) => entry.server !== null).map((entry) => entry.layer),
  ).length;
  const groups = seriesGroups(tool, kept);
  const group = groups.find((candidate) => candidate.key === wanted) ?? groups[0];
  const members = group?.layers ?? [];
  const chosen = picked ?? (group ? firstChoice(group) : []);

  const proposed = seriesTitle(
    tool,
    members.filter((layer) => chosen.includes(layer.id)),
  );
  const title = own ?? proposed;
  const { faults, inputs } = checkSeries({
    group: members,
    chosen,
    place,
    latitude,
    longitude,
    title,
    ...(relative ? { relative: { session: kept, latitude: baseLatitude, longitude: baseLongitude } } : {}),
  });
  const missing = group ? missingOfSeries(faults) : NO_LAYERS;

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

  const toggle = (layer: string, on: boolean) => {
    setPicked(on ? [...chosen, layer] : chosen.filter((other) => other !== layer));
  };

  const shown = {
    layers: left.layers ? faults.layers : null,
    latitude: left.latitude ? faults.latitude : null,
    longitude: left.longitude ? faults.longitude : null,
    referenceLatitude: left.referenceLatitude ? (faults.referenceLatitude ?? null) : null,
    referenceLongitude: left.referenceLongitude ? (faults.referenceLongitude ?? null) : null,
    title: left.title ? faults.title : null,
  };
  const angles = [
    { axis: "latitude", title: "Latitude", value: latitude, set: setLatitude, about: ABOUT_SERIES.latitude },
    { axis: "longitude", title: "Longitude", value: longitude, set: setLongitude, about: ABOUT_SERIES.longitude },
  ] as const;
  const bases = [
    {
      axis: "referenceLatitude",
      title: "Reference latitude",
      value: baseLatitude,
      set: setBaseLatitude,
      about: ABOUT_RELATIVE.referenceLatitude,
    },
    {
      axis: "referenceLongitude",
      title: "Reference longitude",
      value: baseLongitude,
      set: setBaseLongitude,
      about: ABOUT_RELATIVE.referenceLongitude,
    },
  ] as const;

  return (
    <ToolPane
      id={tool}
      title={method.title}
      info={rowOf(method, "What it shows")}
      secondary={{ label: "Method", onClick: () => showMethod(tool) }}
      onRun={start}
      ready={inputs !== null}
      missing={missing ?? undefined}
      run={seriesRunOf(started, jobs, new Set(series.map((item) => item.series.id)))}
      onCancel={started && started.id !== null ? cancel : undefined}
    >
      {!group ? (
        <EmptyState
          title="No layers to use"
          text={RECEIVE_SERIES[tool]}
          action={{ label: "Get layer", onClick: openGetLayer }}
        />
      ) : (
        <>
          {groups.length > 1 ? (
            <>
              <FieldTitle field={`${id}-group`} title="Layer">
                {ABOUT_SERIES.group}
              </FieldTitle>
              <select
                className="usa-select"
                id={`${id}-group`}
                value={group.key}
                aria-describedby={infoId(`${id}-group`)}
                onChange={(event) => {
                  setWanted(event.target.value);
                  setPicked(null);
                }}
              >
                {groups.map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <fieldset
            className="usa-fieldset"
            aria-labelledby={`${id}-layers-title`}
            aria-describedby={describedBy(infoId(`${id}-layers`), shown.layers && `${id}-layers-error`)}
            onBlur={() => setLeft({ ...left, layers: true })}
          >
            <legend className="usa-legend">
              <span id={`${id}-layers-title`}>Layers of the series</span>
              <Info id={infoId(`${id}-layers`)} about="Layers of the series">
                {relative ? ABOUT_RELATIVE.layers : ABOUT_SERIES.layers}
              </Info>
            </legend>
            {members.map((layer) => (
              <div key={layer.id} className="usa-checkbox">
                <input
                  className="usa-checkbox__input"
                  type="checkbox"
                  id={`${id}-layer-${layer.id}`}
                  checked={chosen.includes(layer.id)}
                  onChange={(event) => toggle(layer.id, event.target.checked)}
                />
                <label className="usa-checkbox__label" htmlFor={`${id}-layer-${layer.id}`}>
                  {layer.title}
                </label>
              </div>
            ))}
          </fieldset>
          <FieldError id={`${id}-layers-error`}>{shown.layers}</FieldError>

          {relative ? null : (
            <fieldset
              className="usa-fieldset"
              aria-labelledby={`${id}-place-title`}
              aria-describedby={infoId(`${id}-place`)}
            >
              <legend className="usa-legend">
                <span id={`${id}-place-title`}>Place</span>
                <Info id={infoId(`${id}-place`)} about="Place">
                  {ABOUT_SERIES.place}
                </Info>
              </legend>
              {(Object.keys(PLACES) as Place[]).map((value) => (
                <div key={value} className="usa-radio">
                  <input
                    className="usa-radio__input"
                    type="radio"
                    id={`${id}-place-${value}`}
                    name={`${id}-place`}
                    checked={place === value}
                    onChange={() => setPlace(value)}
                  />
                  <label className="usa-radio__label" htmlFor={`${id}-place-${value}`}>
                    {PLACES[value]}
                  </label>
                </div>
              ))}
            </fieldset>
          )}

          {relative || place === "point"
            ? [...angles, ...(relative ? bases : [])].map(({ axis, title: name, value, set, about }) => {
                const field = `${id}-${axis}`;
                const fault = shown[axis];
                return (
                  <div key={axis}>
                    <FieldTitle field={field} title={name}>
                      {about}
                    </FieldTitle>
                    <input
                      className={fault ? "usa-input usa-input--error" : "usa-input"}
                      id={field}
                      value={value}
                      autoComplete="off"
                      aria-invalid={fault ? true : undefined}
                      aria-describedby={describedBy(infoId(field), fault && `${field}-error`)}
                      onBlur={() => setLeft({ ...left, [axis]: true })}
                      onChange={(event) => set(event.target.value)}
                    />
                    <FieldError id={`${field}-error`}>{fault}</FieldError>
                  </div>
                );
              })
            : null}

          <FieldTitle field={`${id}-title`} title="Series name">
            {ABOUT_SERIES.title}
          </FieldTitle>
          <input
            className={shown.title ? "usa-input usa-input--error" : "usa-input"}
            id={`${id}-title`}
            value={title}
            maxLength={MOST_TITLE}
            autoComplete="off"
            aria-invalid={shown.title ? true : undefined}
            aria-describedby={describedBy(infoId(`${id}-title`), shown.title && `${id}-title-error`)}
            onBlur={() => setLeft({ ...left, title: true })}
            onChange={(event) => setOwn(event.target.value)}
          />
          <FieldError id={`${id}-title-error`}>{shown.title}</FieldError>
        </>
      )}
      {elsewhere > 0 ? <Notice kind="info">{ownServerSentence(elsewhere)}</Notice> : null}
    </ToolPane>
  );
}
