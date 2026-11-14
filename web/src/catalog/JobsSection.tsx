import { useId, useRef, useState } from "react";
import { JobFields } from "../data/JobFields";
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
import { wordsOf } from "../data/service";
import { Dialog } from "../shared/dialog/Dialog";
import { Icon } from "../shared/icon/Icon";
import { Info } from "../shared/info/Info";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { keepFocus, openLayerStore } from "./state";

const STATUS_ICONS: Record<JobStatus, string> = {
  accepted: "schedule",
  running: "autorenew",
  successful: "check_circle",
  failed: "error",
  dismissed: "cancel",
};

/** The explanation of the section. It shows from the button beside the heading. */
export const ABOUT_JOBS =
  "The requests of this session to receive a layer or to run an analysis tool. A job that waits or runs can be cancelled. A finished job can be run again with the same inputs. The removal of the record of a job leaves the layer that the job produced.";

/** State how many jobs the list holds, by their state, as "3 jobs: 1 running, 2 finished." */
export function jobsSentence(jobs: readonly Job[]): string {
  const count = (status: JobStatus) => jobs.filter((job) => job.status === status).length;
  const parts = [
    [count("running"), "running"],
    [count("accepted"), "waiting"],
    [count("successful"), "finished"],
    [count("failed"), "failed"],
  ] as const;
  const states = parts.filter(([number]) => number > 0).map(([number, word]) => `${String(number)} ${word}`);
  return `${String(jobs.length)} ${jobs.length === 1 ? "job" : "jobs"}: ${states.join(", ")}.`;
}

/** State when a job was requested or ended, and for how long it has worked. */
function timeWords(job: Job): string {
  const time = runTime(job);
  const moment = job.finished ? `Ended ${formatMoment(job.finished)}` : `Requested ${formatMoment(job.created)}`;
  return time === null ? moment : `${moment}, after ${formatRunTime(time)} of work`;
}

interface JobItemProps {
  job: Job;
  open: boolean;
  onToggle: () => void;
  onDetails: () => void;
  /** Called after the job has left the list. */
  onGone: () => void;
}

/**
 * One job of the list: its name, its state in words, its times and the sentence of the server. A job that waits
 * or runs shows its progress. A click on the job shows its tools under it.
 */
function JobItem({ job, open, onToggle, onDetails, onGone }: JobItemProps) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const made = useStore(layersStore).some((entry) => entry.layer.id === job.layer);
  const unfinished = isUnfinished(job);
  const { inputs } = job;

  const act = (action: () => Promise<unknown>, done: string | null, failure: string, gone = false) => {
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

  return (
    <li className={open ? `job job--${job.status} job--open` : `job job--${job.status}`}>
      <button
        type="button"
        className="catalog-item"
        aria-expanded={open}
        aria-controls={`${id}-tools`}
        onClick={onToggle}
      >
        <span className="catalog-item-title">
          <Icon name={STATUS_ICONS[job.status]} /> {job.title}
        </span>
        <span>
          {STATUS_WORDS[job.status]}
          {unfinished ? `, ${String(job.progress)} %` : null}
        </span>
        <span>{timeWords(job)}</span>
        {job.status === "successful" || job.message === "" ? null : <span className="job-message">{job.message}</span>}
      </button>
      {unfinished ? (
        <progress className="job-progress" max={100} value={job.progress} aria-label={`Progress of ${job.title}`} />
      ) : null}
      <div id={`${id}-tools`} hidden={!open}>
        <div className="catalog-tools job-tools" role="group" aria-label={`Tools of the job ${job.title}`}>
          {unfinished ? (
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              disabled={busy}
              onClick={() =>
                act(
                  () => dismissJob(job.jobID),
                  `The job "${job.title}" was cancelled.`,
                  "The job could not be cancelled.",
                  true,
                )
              }
            >
              Cancel
            </button>
          ) : null}
          <button type="button" className="usa-button usa-button--unstyled" onClick={onDetails}>
            Details
          </button>
          {made && job.layer ? (
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              onClick={() => openLayerStore.set(job.layer ?? null)}
            >
              Show layer
            </button>
          ) : null}
          {!unfinished && inputs ? (
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              disabled={busy}
              onClick={() =>
                act(
                  () => startJob(job.processID, inputs),
                  `The job "${job.title}" was started again.`,
                  "The job could not be started.",
                )
              }
            >
              Run again
            </button>
          ) : null}
          {unfinished ? null : (
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              disabled={busy}
              onClick={() => act(() => dismissJob(job.jobID), null, "The job could not be removed.", true)}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The section "Jobs" of the Catalog pane: the jobs of the session, as the History pane of ArcGIS Pro lists the
 * runs of the geoprocessing tools. A job can be cancelled while it waits or runs. Afterwards it can be run
 * again with the same inputs, and its record can be removed, which leaves its layer in place. The section is
 * shown while the session has a job.
 */
export function JobsSection() {
  const id = useId();
  const jobs = useStore(jobsStore);
  const fault = useStore(jobsFaultStore);
  const [sort, setSort] = useState<JobSort>("newest");
  const [filter, setFilter] = useState<JobFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  if (jobs.length === 0 && fault === null) {
    return null;
  }

  const shown = sortJobs(filterJobs(jobs, filter), sort);
  const described = jobs.find((job) => job.jobID === details);
  const ended = jobs.filter((job) => !isUnfinished(job)).length;

  const removeFinished = () => {
    setRemoving(true);
    removeFinishedJobs()
      .then((removed) => {
        report(
          "info",
          removed === 1 ? "The record of 1 job was removed." : `The records of ${String(removed)} jobs were removed.`,
        );
        keepFocus(() => heading.current);
      })
      .catch((error: unknown) => report("error", wordsOf(error, "The records could not be removed.")))
      .finally(() => setRemoving(false));
  };

  return (
    <section className="catalog-section catalog-jobs" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-info`}>
      <div className="catalog-heading">
        <div className="info-title">
          <h3 id={`${id}-heading`} ref={heading} tabIndex={-1}>
            Jobs
          </h3>
          <Info id={`${id}-info`} about="Jobs">
            {ABOUT_JOBS}
          </Info>
        </div>
        <button
          type="button"
          className="usa-button usa-button--unstyled"
          disabled={ended === 0 || removing}
          onClick={removeFinished}
        >
          Remove finished
        </button>
      </div>
      <p className="catalog-summary" role="status">
        {jobs.length === 0 ? null : jobsSentence(jobs)}
      </p>
      {fault === null ? null : (
        <p className="usa-error-message catalog-fault" role="alert">
          {fault}{" "}
          <button type="button" className="usa-button usa-button--unstyled" onClick={() => void loadJobs()}>
            Read again
          </button>
        </p>
      )}
      {jobs.length === 0 ? null : (
        <>
          <div className="catalog-choices">
            <label htmlFor={`${id}-sort`}>Sort by</label>
            <select
              className="usa-select"
              id={`${id}-sort`}
              value={sort}
              onChange={(event) => setSort(event.target.value as JobSort)}
            >
              {Object.entries(JOB_SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-filter`}>Show</label>
            <select
              className="usa-select"
              id={`${id}-filter`}
              value={filter}
              onChange={(event) => setFilter(event.target.value as JobFilter)}
            >
              {Object.entries(JOB_FILTERS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="catalog-summary">No job of the list is in this state.</p>
          ) : (
            <ul className="catalog-list session-list">
              {shown.map((job) => (
                <JobItem
                  key={job.jobID}
                  job={job}
                  open={job.jobID === open}
                  onToggle={() => setOpen(job.jobID === open ? null : job.jobID)}
                  onDetails={() => setDetails(job.jobID)}
                  onGone={() => keepFocus(() => heading.current)}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {described ? (
        <Dialog title={`Job: ${described.title}`} open onClose={() => setDetails(null)} large>
          <JobFields job={described} />
        </Dialog>
      ) : null}
    </section>
  );
}
