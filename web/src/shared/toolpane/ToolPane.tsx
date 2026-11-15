import { useId, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { Dialog } from "../dialog/Dialog";
import { closeToolPane, dockStore } from "../dock/dock";
import { DockPane } from "../dock/DockPane";
import { Icon } from "../icon/Icon";
import { Info } from "../info/Info";
import { CloseButton } from "../notice/Notice";
import { useStore } from "../store";

/**
 * What the foot of a tool pane shows about a run of the tool. While the tool runs, `progress` is the share of the
 * work done, from 0 to 1; without it the bar shows that the work goes on, with no share. After the run, `text`
 * states the outcome in one sentence, `action` is the link to the next step, and `details` holds whatever else
 * the tool reports. The foot shows the outcome with an X that closes it.
 */
export type ToolPaneRun =
  | { state: "running"; progress?: number; text?: string }
  | {
      state: "success" | "warning" | "error";
      text: string;
      action?: { label: string; onClick: () => void };
      details?: ReactNode;
    };

/** The outcome of a run: what the foot shows after the run, until the user closes it. */
type Outcome = Exclude<ToolPaneRun, { state: "running" }>;

interface ToolPaneProps {
  /** Unique name of the pane: the name of the ribbon button that opens it with `openToolPane`. */
  id: string;
  /** Name of the tool, shown at the top of the pane and on its tab. */
  title: string;
  /** What the tool does and how it is used, in complete sentences. It shows from the "i" beside the title. */
  info?: ReactNode;
  /** Label of the button that runs the tool. */
  runLabel?: string;
  /** Called when the user presses the run button, or the Enter key in a field. It is not called during a run. */
  onRun: () => void;
  /** Whether the tool has what it needs to run. The run button is inactive without it. */
  ready?: boolean;
  /** The first thing that the tool still lacks, in one sentence. The foot shows it while the tool is not ready. */
  missing?: string;
  /** The run in progress or the outcome of the last run, or null before the first run. */
  run?: ToolPaneRun | null;
  /**
   * One secondary command of the tool, such as "Restore defaults": a link at the left end of the foot. `info` is
   * its explanation, in complete sentences, which shows from the "i" beside the link.
   */
  secondary?: { label: string; onClick: () => void; info?: ReactNode };
  /** Called when the user stops a run. The Cancel button shows during a run only when this is given. */
  onCancel?: () => void;
  /** Called after the user has closed the pane. */
  onClose?: () => void;
  /** The parameters of the tool: form elements of the design system, and groups of them (`ToolPaneGroup`). */
  children: ReactNode;
}

const STATE_ICONS = { success: "check_circle", warning: "warning", error: "error" } as const;

/**
 * The form of a tool, in a pane on the right of the map, as the Geoprocessing pane of ArcGIS Pro shows a tool:
 * the title, the parameters, which scroll, and at the foot the run button and, after the first run, the progress
 * with a Cancel button or the outcome with a link to the next step and a link to its details. While the tool is
 * not ready, the foot states beside the inactive run button what is still missing. One secondary command of the
 * tool stands as a link at the left end of the foot. The pane is not modal, so the map and the ribbon stay in use.
 *
 * The X at the right end of the outcome closes it, as the X of a banner at the foot of a pane of ArcGIS Pro does.
 * The foot then shows what it shows before a run, until the run button is pressed again or the outcome changes.
 * The X stops no run and removes no layer or result, and the progress of a run has none.
 *
 * A ribbon button opens the pane with `openToolPane(id)`, and the tool closes it with `closeToolPane(id)`. The
 * content is drawn only while the pane is open, so a component inside the pane starts again each time the pane
 * opens; state kept in the component that declares the pane lasts while the pane is closed.
 *
 * The explanation of a parameter does not stand under its title: it goes into an `Info` element beside the
 * title, and the explanation of the tool itself into the property `info`.
 *
 *     function BufferPane() {
 *       const [distance, setDistance] = useState("100");
 *       const [run, setRun] = useState<ToolPaneRun | null>(null);
 *       const start = () => {
 *         setRun({ state: "running" });
 *         buffer(Number(distance)).then(
 *           () => setRun({ state: "success", text: "The buffer was added to the map." }),
 *           (error: Error) => setRun({ state: "error", text: error.message }),
 *         );
 *       };
 *       return (
 *         <ToolPane id="buffer" title="Buffer" onRun={start} ready={distance !== ""}
 *           missing="Enter the distance." run={run}>
 *           <label className="usa-label" htmlFor="buffer-distance">Distance (m)</label>
 *           <input className="usa-input" id="buffer-distance" value={distance}
 *             onChange={(event) => setDistance(event.target.value)} />
 *         </ToolPane>
 *       );
 *     }
 */
export function ToolPane({
  id,
  title,
  info,
  runLabel = "Run",
  onRun,
  ready = true,
  missing,
  run = null,
  secondary,
  onCancel,
  onClose,
  children,
}: ToolPaneProps) {
  const open = useStore(dockStore).tools.includes(id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const missingId = useId();
  const secondaryInfoId = useId();
  // The outcome of the last run, and the words that name it: its state and its text.
  const outcome: Outcome | null = run !== null && run.state !== "running" ? run : null;
  const outcomeWords = outcome ? `${outcome.state}: ${outcome.text}` : null;
  // The words of the outcome that the user has closed, or null. Another outcome, or a run, opens the foot again.
  const [closed, setClosed] = useState<string | null>(null);
  if (closed !== null && closed !== outcomeWords) {
    setClosed(null);
  }

  if (!open) {
    return null;
  }

  const running = run?.state === "running";
  const inactive = !ready || running;
  const lacking = !ready && !running ? missing : undefined;
  const shown = closed === outcomeWords ? null : outcome;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!inactive) {
      // The next run shows its outcome, also when that outcome states the same as the one that was closed.
      setClosed(null);
      onRun();
    }
  };

  const close = () => {
    closeToolPane(id);
    onClose?.();
  };

  // The X leaves the foot with the outcome. When it had the keyboard focus, the focus moves to the run button.
  const closeOutcome = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (document.activeElement === button) {
      button.closest(".tool-pane-foot")?.querySelector<HTMLElement>(".tool-pane-actions > [type='submit']")?.focus();
    }
    setClosed(outcomeWords);
  };

  return (
    <DockPane id={id} title={title} info={info} onClose={close}>
      <form className="usa-form tool-pane" onSubmit={onSubmit} noValidate>
        <div className="tool-pane-body">{children}</div>
        <div className="tool-pane-foot">
          <div className="tool-pane-actions">
            {secondary ? (
              <span className="tool-pane-secondary">
                <button
                  type="button"
                  className="usa-button usa-button--unstyled"
                  aria-describedby={secondary.info ? secondaryInfoId : undefined}
                  onClick={secondary.onClick}
                >
                  {secondary.label}
                </button>
                {secondary.info ? (
                  <Info id={secondaryInfoId} about={secondary.label}>
                    {secondary.info}
                  </Info>
                ) : null}
              </span>
            ) : null}
            {lacking ? (
              <p className="tool-pane-missing" id={missingId} role="status">
                {lacking}
              </p>
            ) : null}
            {/* An inactive run button stays in the order of the keyboard, as an unfinished button of the ribbon does. */}
            <button
              type="submit"
              className="usa-button"
              aria-disabled={inactive ? true : undefined}
              aria-describedby={lacking ? missingId : undefined}
            >
              {runLabel}
            </button>
          </div>
          {running ? (
            <div className="tool-pane-status tool-pane-status--running">
              <progress
                className="tool-pane-progress"
                max={1}
                value={run.progress}
                aria-label={`Progress of ${title}`}
              />
              <span className="tool-pane-status-text" role="status">
                {run.text ?? "Running"}
                {run.progress === undefined ? null : ` (${String(Math.round(run.progress * 100))} %)`}
              </span>
              {onCancel ? (
                <button type="button" className="usa-button usa-button--unstyled" onClick={onCancel}>
                  Cancel
                </button>
              ) : null}
            </div>
          ) : shown ? (
            <div className={`tool-pane-status tool-pane-status--${shown.state} tool-pane-status--closable`}>
              <Icon name={STATE_ICONS[shown.state]} />
              <span className="tool-pane-status-text" role={shown.state === "error" ? "alert" : "status"}>
                {shown.text}
              </span>
              {shown.action ? (
                <button type="button" className="usa-button usa-button--unstyled" onClick={shown.action.onClick}>
                  {shown.action.label}
                </button>
              ) : null}
              {shown.details ? (
                <button type="button" className="usa-button usa-button--unstyled" onClick={() => setDetailsOpen(true)}>
                  View details
                </button>
              ) : null}
              <CloseButton onClick={closeOutcome} />
            </div>
          ) : null}
        </div>
      </form>
      {shown?.details ? (
        <Dialog title={`${title}: details`} open={detailsOpen} onClose={() => setDetailsOpen(false)}>
          {shown.details}
        </Dialog>
      ) : null}
    </DockPane>
  );
}

interface ToolPaneGroupProps {
  /** Name of the group, shown on the line that opens and closes it. */
  title: string;
  /** Whether the group starts open. */
  open?: boolean;
  children: ReactNode;
}

/**
 * A group of parameters that opens and closes with a click on its name. It is the details element of the
 * browser, and its name is drawn as the header of a `Section` is: an arrow and the name in bold.
 */
export function ToolPaneGroup({ title, open = false, children }: ToolPaneGroupProps) {
  return (
    <details className="tool-pane-group" open={open}>
      <summary>
        <Icon name="expand_more" />
        {title}
      </summary>
      <div className="tool-pane-group-body">{children}</div>
    </details>
  );
}
