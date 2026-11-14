import { useState, type ReactNode, type SyntheticEvent } from "react";
import { Dialog } from "../dialog/Dialog";
import { closeToolPane, dockStore } from "../dock/dock";
import { DockPane } from "../dock/DockPane";
import { Icon } from "../icon/Icon";
import { useStore } from "../store";

/**
 * What the foot of a tool pane shows about a run of the tool. While the tool runs, `progress` is the share of the
 * work done, from 0 to 1; without it the bar shows that the work goes on, with no share. After the run, `text`
 * states the outcome in one sentence, and `details` holds whatever else the tool reports.
 */
export type ToolPaneRun =
  | { state: "running"; progress?: number; text?: string }
  | { state: "success" | "warning" | "error"; text: string; details?: ReactNode };

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
  /** The run in progress or the outcome of the last run, or null before the first run. */
  run?: ToolPaneRun | null;
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
 * with a Cancel button or the outcome with a link to its details. The pane is not modal, so the map and the
 * ribbon stay in use.
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
 *         <ToolPane id="buffer" title="Buffer" onRun={start} ready={distance !== ""} run={run}>
 *           <label className="usa-label" htmlFor="buffer-distance">Distance in metres</label>
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
  run = null,
  onCancel,
  onClose,
  children,
}: ToolPaneProps) {
  const open = useStore(dockStore).tools.includes(id);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!open) {
    return null;
  }

  const running = run?.state === "running";
  const inactive = !ready || running;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!inactive) {
      onRun();
    }
  };

  const close = () => {
    closeToolPane(id);
    onClose?.();
  };

  return (
    <DockPane id={id} title={title} info={info} onClose={close}>
      <form className="usa-form tool-pane" onSubmit={onSubmit} noValidate>
        <div className="tool-pane-body">{children}</div>
        <div className="tool-pane-foot">
          <div className="tool-pane-actions">
            {/* An inactive run button stays in the order of the keyboard, as an unfinished button of the ribbon does. */}
            <button type="submit" className="usa-button" aria-disabled={inactive ? true : undefined}>
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
          ) : run ? (
            <div className={`tool-pane-status tool-pane-status--${run.state}`}>
              <Icon name={STATE_ICONS[run.state]} />
              <span className="tool-pane-status-text" role={run.state === "error" ? "alert" : "status"}>
                {run.text}
              </span>
              {run.details ? (
                <button type="button" className="usa-button usa-button--unstyled" onClick={() => setDetailsOpen(true)}>
                  View details
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>
      {run && run.state !== "running" && run.details ? (
        <Dialog title={`${title}: details`} open={detailsOpen} onClose={() => setDetailsOpen(false)}>
          {run.details}
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
 * browser.
 */
export function ToolPaneGroup({ title, open = false, children }: ToolPaneGroupProps) {
  return (
    <details className="tool-pane-group" open={open}>
      <summary>{title}</summary>
      <div className="tool-pane-group-body">{children}</div>
    </details>
  );
}
