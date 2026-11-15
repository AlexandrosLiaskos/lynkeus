// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useState } from "react";
import {
  dismissJob,
  filterJobs,
  formatMoment,
  formatRunTime,
  isUnfinished,
  JOB_FILTERS,
  JOB_SORTS,
  jobsFaultStore,
  jobsStore,
  loadJobs,
  removeFinishedJobs,
  runTime,
  sortJobs,
  startJob,
  STATUS_WORDS,
  type Job,
  type JobFilter,
  type JobSort,
  type JobStatus,
} from "../data/jobs";
import { layersStore } from "../data/layers";
import { seriesStore, showSeries } from "../data/series";
import { wordsOf } from "../data/service";
import { Dialog } from "../shared/dialog/Dialog";
import { Icon } from "../shared/icon/Icon";
import { MenuButton, type MenuButtonItem } from "../shared/menu/MenuButton";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { PROJECT_SERVER, PROJECT_SERVER_WORDS, serversStore, type Server } from "../shared/servers";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { Toolbar } from "../shared/toolbar/Toolbar";
import { jobGroups } from "./details";
import { keepFocus, SECTIONS, showLayer, titleOf } from "./state";

const STATUS_ICONS: Record<JobStatus, string> = {
  accepted: "schedule",
  running: "autorenew",
  successful: "check_circle",
  failed: "error",
  dismissed: "cancel",
};

/** The explanation of the section. It shows from the "i" beside its title. */
export const ABOUT_JOBS =
  "The requests of this session to receive a layer or to run an analysis tool. A job that waits or runs can be cancelled, and a finished job can be run again with the same inputs. The removal of the record of a job leaves the layer that the job produced.";

/** State how many jobs of the list are in each state, as "1 running, 2 finished." */
export function jobsSentence(jobs: readonly Job[]): string {
  const count = (status: JobStatus) => jobs.filter((job) => job.status === status).length;
  const parts = [
    [count("running"), "running"],
    [count("accepted"), "waiting"],
    [count("successful"), "finished"],
    [count("failed"), "failed"],
    [count("dismissed"), "cancelled"],
  ] as const;
  const states = parts.filter(([number]) => number > 0).map(([number, word]) => `${String(number)} ${word}`);
  return `${states.join(", ")}.`;
}

/** State the state of a job in words. A job that waits or runs also states its progress and its time of work. */
export function stateWords(job: Job): string {
  if (!isUnfinished(job)) {
    return STATUS_WORDS[job.status];
  }
  const time = runTime(job);
  const state = `${STATUS_WORDS[job.status]}, ${String(job.progress)} %`;
  return time === null ? state : `${state} after ${formatRunTime(time)}`;
}

/**
 * Return the second line of a job. A job that waits, runs or has failed shows the sentence of the server about
 * it. Every other job, and a job without a sentence, shows when it was requested or when it ended and for how
 * long it worked.
 */
export function noteWords(job: Job): string {
  if (job.status !== "successful" && job.message !== "") {
    return job.message;
  }
  const time = runTime(job);
  const moment = job.finished ? `Ended ${formatMoment(job.finished)}` : `Requested ${formatMoment(job.created)}`;
  return time === null ? moment : `${moment}, after ${formatRunTime(time)} of work`;
}

/**
 * Return the words that say on which server a job runs, or null where the list does not say it: for a job of
 * the project server of a visitor who has no own server.
 */
export function serverWords(job: Job, servers: readonly Server[]): string | null {
  if (job.server) {
    return `On ${job.server.name}`;
  }
  return servers.length > 0 ? `On the ${PROJECT_SERVER_WORDS.toLowerCase()}` : null;
}

/**
 * Return the sentence for a job that waits or runs on an own server that is not connected, or null. The state
 * that the list shows is then the last one that the server reported.
 */
export function awayWords(job: Job, servers: readonly Server[]): string | null {
  const server = servers.find((listed) => listed.id === job.server?.id);
  return server && !server.connected && isUnfinished(job)
    ? `The server "${server.name}" is not connected, so this is the last state that it reported. The state follows when the server connects again.`
    : null;
}

interface JobItemProps {
  job: Job;
  onDetails: () => void;
  /** Called after the job has left the list. */
  onGone: () => void;
}

/**
 * One job of the list: its name, its state in words, a bar of its progress while it waits or runs, and one
 * line about it. The item shows the one command that fits the state of the job: Cancel while the job waits or
 * runs, Show layer when its layer is in the list of layers, Show series when its series is in the list of
 * series, and otherwise Run again. Its other commands stand
 * in the menu "More". A visitor who has an own server also reads on which server the job runs, and a job of a
 * server that is not connected says so. Run again starts the job on the server on which it ran.
 */
function JobItem({ job, onDetails, onGone }: JobItemProps) {
  const servers = useStore(serversStore)?.servers ?? [];
  const on = serverWords(job, servers);
  const away = awayWords(job, servers);
  const [busy, setBusy] = useState(false);
  const made = useStore(layersStore).some((entry) => entry.layer.id === job.layer);
  const listed = useStore(seriesStore).some((item) => item.series.id === job.series);
  const unfinished = isUnfinished(job);
  const { inputs, layer, series } = job;

  const act = (action: () => Promise<unknown>, done: string | null, failure: string, gone = false) => {
    if (busy) {
      return;
    }
    setBusy(true);
    action()
      .then(() => {
        if (done !== null) {
          report("info", done);
        }
        if (gone) {
          onGone();
        }
      })
      .catch((error: unknown) => report("error", wordsOf(error, failure)))
      .finally(() => setBusy(false));
  };

  const cancel = () =>
    act(() => dismissJob(job.jobID), `The job "${job.title}" was cancelled.`, "The job could not be cancelled.", true);
  const remove = () => act(() => dismissJob(job.jobID), null, "The job could not be removed.", true);
  const runAgain = inputs
    ? () =>
        act(
          () => startJob(job.processID, inputs, job.server?.id ?? (servers.length > 0 ? PROJECT_SERVER : undefined)),
          `The job "${job.title}" was started again.`,
          "The job could not be started.",
        )
    : null;

  const main = unfinished
    ? { label: "Cancel", run: cancel }
    : made && layer
      ? { label: "Show layer", run: () => showLayer(layer) }
      : listed && series
        ? { label: "Show series", run: () => showSeries(series) }
        : runAgain
          ? { label: "Run again", run: runAgain }
          : null;
  const more: MenuButtonItem[] = [
    { label: "Details", onSelect: onDetails },
    ...(!unfinished && runAgain && main?.run !== runAgain ? [{ label: "Run again", onSelect: runAgain }] : []),
    ...(unfinished ? [] : [{ label: "Remove", onSelect: remove, separated: true }]),
  ];

  return (
    <li className={`item job job--${job.status}`}>
      <div className="item-main">
        <p className="item-title">
          <Icon name={STATUS_ICONS[job.status]} /> {job.title}
        </p>
        <p className="item-line">{on === null ? stateWords(job) : `${stateWords(job)} · ${on}`}</p>
        {unfinished ? (
          <progress className="job-progress" max={100} value={job.progress} aria-label={`Progress of ${job.title}`} />
        ) : null}
        <p className="item-line job-note">{noteWords(job)}</p>
        {away === null ? null : <Notice kind="warning">{away}</Notice>}
      </div>
      <div className="item-actions catalog-actions" role="group" aria-label={`Commands of the job ${job.title}`}>
        {main ? (
          <button
            type="button"
            className="usa-button usa-button--unstyled"
            aria-disabled={busy ? true : undefined}
            onClick={main.run}
          >
            {main.label}
          </button>
        ) : null}
        <MenuButton icon="more_vert" label="More" name={`More commands of ${job.title}`} items={more} />
      </div>
    </li>
  );
}

/**
 * The section "Jobs" of the Catalog pane: the jobs of the session, as the History pane of ArcGIS Pro lists the
 * runs of the geoprocessing tools. A job can be cancelled while it waits or runs. Afterwards it can be run
 * again with the same inputs, and its record can be removed, which leaves its layer in place. The commands of
 * the list stand in the header of the section: its order, the part of it that is shown, a new reading from the
 * server, and the removal of the records of all finished jobs. Without a job the section says how it fills.
 */
export function JobsSection() {
  const jobs = useStore(jobsStore);
  const fault = useStore(jobsFaultStore);
  const [sort, setSort] = useState<JobSort>("newest");
  const [filter, setFilter] = useState<JobFilter>("all");
  const [details, setDetails] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const shown = sortJobs(filterJobs(jobs, filter), sort);
  const described = jobs.find((job) => job.jobID === details);
  const ended = jobs.filter((job) => !isUnfinished(job)).length;
  const title = () => titleOf(SECTIONS.jobs);
  const read = () => void loadJobs();

  const removeFinished = () => {
    setRemoving(true);
    removeFinishedJobs()
      .then((removed) => {
        report(
          "info",
          removed === 1 ? "The record of 1 job was removed." : `The records of ${String(removed)} jobs were removed.`,
        );
        keepFocus(title);
      })
      .catch((error: unknown) => report("error", wordsOf(error, "The records could not be removed.")))
      .finally(() => setRemoving(false));
  };

  const commands =
    jobs.length > 0 ? (
      <Toolbar label="Commands of the list of jobs">
        <MenuButton
          icon="sort_arrow"
          label="Sort by"
          items={Object.entries(JOB_SORTS).map(([value, label]) => ({
            label,
            checked: value === sort,
            onSelect: () => setSort(value as JobSort),
          }))}
        />
        <MenuButton
          icon="filter_list"
          label="Show"
          items={Object.entries(JOB_FILTERS).map(([value, label]) => ({
            label,
            checked: value === filter,
            onSelect: () => setFilter(value as JobFilter),
          }))}
        />
        <IconButton icon="autorenew" label="Read again" onClick={read} />
        <IconButton
          icon="delete"
          label="Remove finished jobs"
          disabled={ended === 0 || removing}
          reason={removing ? "The records are being removed." : "No job of the list has ended."}
          onClick={removeFinished}
        />
      </Toolbar>
    ) : fault === null ? undefined : (
      <IconButton icon="autorenew" label="Read again" onClick={read} />
    );

  return (
    <>
      <Section id={SECTIONS.jobs} title="Jobs" count={jobs.length} info={ABOUT_JOBS} actions={commands}>
        {fault === null ? null : (
          <Notice kind="error" action={{ label: "Read again", onClick: read }}>
            {fault}
          </Notice>
        )}
        {jobs.length === 0 ? (
          fault === null ? (
            <p className="catalog-note">A job starts when a layer is requested or an analysis tool is run.</p>
          ) : null
        ) : (
          <>
            <p className="catalog-note" role="status">
              {jobsSentence(jobs)}
            </p>
            {shown.length === 0 ? (
              <p className="catalog-note">No job of the list is in this state.</p>
            ) : (
              <ul className="item-list pane-bleed">
                {shown.map((job) => (
                  <JobItem
                    key={job.jobID}
                    job={job}
                    onDetails={() => setDetails(job.jobID)}
                    onGone={() => keepFocus(title)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </Section>
      {described ? (
        <Dialog title={`Job: ${described.title}`} open onClose={() => setDetails(null)} large>
          <PropertyList groups={jobGroups(described)} />
        </Dialog>
      ) : null}
    </>
  );
}
