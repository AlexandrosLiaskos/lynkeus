import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { wordsOf } from "../data/service";
import { sizeWords } from "../header/notice/numbers";
import { describedBy, FieldError } from "../shared/field/FieldError";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Icon } from "../shared/icon/Icon";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { PropertyList } from "../shared/properties/PropertyList";
import { MOST_NAME, MOST_RUNNING_JOBS, type Server, type ServerLimits } from "../shared/servers";
import { IconButton } from "../shared/toolbar/IconButton";
import { Toolbar } from "../shared/toolbar/Toolbar";
import { removeServer, renameServer, setServerLimits } from "./requests";
import {
  connectionWords,
  draftOf,
  limitsFaults,
  limitsOf,
  serverGroups,
  storageProblem,
  type LimitsDraft,
} from "./words";

/** The explanations of the fields of a server, one for each title. Each one shows from the button beside its title. */
export const ABOUT = {
  name: `The name under which the lists of jobs and of layers and the field Server of a tool show this server, of at most ${String(MOST_NAME)} characters. The name of the computer itself does not change.`,
  jobs: `The most jobs that run on this server at the same time, from 1 to ${String(MOST_RUNNING_JOBS)}. A job that arrives beyond them waits for its turn.`,
  storage:
    "The most space that the layers of this server may use on its disk, in gigabytes of 1000 megabytes. The server keeps the layers that it already has.",
  layer: "The largest size of the files of one layer, in gigabytes of 1000 megabytes.",
} as const;

/**
 * State what happens to the jobs and the layers of a server when the server is removed. The project server
 * removes the records of both, so they leave the lists; the files of the layers stay on the computer.
 */
export function removalWords(layers: number | null): string {
  const jobs = "Its jobs leave the list of jobs.";
  if (layers === 0) {
    return `${jobs} It keeps no layer.`;
  }
  if (layers === 1) {
    return `${jobs} The files of its layer stay on that computer, and the layer leaves the lists and the map of Lynkeus.`;
  }
  const count = layers === null ? "its layers" : `its ${String(layers)} layers`;
  return `${jobs} The files of ${count} stay on that computer, and the layers leave the lists and the map of Lynkeus.`;
}

/**
 * State where new limits of a server are after the project server took them: on their way to a server that is
 * connected, or kept for a server that is not, which receives them when it connects again.
 */
export function sentWords(server: Server): string {
  return server.connected
    ? `The new limits were sent to the server "${server.name}".`
    : `The new limits are kept for the server "${server.name}", which receives them when it connects again.`;
}

/** Tell whether two sets of limits are the same. */
function sameLimits(one: ServerLimits, other: ServerLimits): boolean {
  return (
    one.running_jobs === other.running_jobs && one.storage === other.storage && one.layer_size === other.layer_size
  );
}

/** State the limits that a server has not applied yet. */
export function pendingWords(limits: ServerLimits): string {
  return `The server has not applied its new limits yet: ${String(limits.running_jobs)} ${limits.running_jobs === 1 ? "job" : "jobs"} at the same time, ${sizeWords(limits.storage)} for layers and ${sizeWords(limits.layer_size)} for one layer. The list shows them once the server reports them.`;
}

interface FormProps {
  server: Server;
  /** Called when the form ends, with or without a change. */
  onEnd: () => void;
}

/** The buttons of a form of a server: the command, and the link that leaves the server as it is. */
function FormButtons({
  label,
  busy,
  danger,
  onEnd,
}: {
  label: string;
  busy: boolean;
  danger?: boolean;
  onEnd: () => void;
}) {
  return (
    <div className="servers-buttons">
      <button
        type="submit"
        className={danger ? "usa-button usa-button--secondary" : "usa-button usa-button--outline"}
        aria-disabled={busy ? true : undefined}
      >
        {label}
      </button>
      <button type="button" className="usa-button usa-button--unstyled" onClick={onEnd}>
        Cancel
      </button>
    </div>
  );
}

/** The field that gives a server another name. */
function RenameForm({ server, onEnd }: FormProps) {
  const id = useId();
  const [name, setName] = useState(server.name);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const next = name.trim();
    if (next === "") {
      setFault("Enter the new name of the server.");
      return;
    }
    if (next === server.name) {
      onEnd();
      return;
    }
    setFault(null);
    setRefusal(null);
    setBusy(true);
    renameServer(server.id, next).then(
      () => {
        report("info", `The server was renamed to "${next}".`);
        onEnd();
      },
      (error: unknown) => {
        setRefusal(wordsOf(error, "The server could not be renamed."));
        setBusy(false);
      },
    );
  };

  return (
    <form className="usa-form server-form" onSubmit={submit} noValidate>
      <FieldTitle field={`${id}-name`} title="New name">
        {ABOUT.name}
      </FieldTitle>
      <input
        className={fault ? "usa-input usa-input--error" : "usa-input"}
        id={`${id}-name`}
        value={name}
        maxLength={MOST_NAME}
        autoComplete="off"
        autoFocus
        aria-invalid={fault ? true : undefined}
        aria-describedby={describedBy(infoId(`${id}-name`), fault && `${id}-fault`, refusal && `${id}-refusal`)}
        onChange={(event) => setName(event.target.value)}
      />
      <FieldError id={`${id}-fault`}>{fault}</FieldError>
      {refusal ? (
        <Notice kind="error" id={`${id}-refusal`}>
          {refusal}
        </Notice>
      ) : null}
      <FormButtons label="Rename" busy={busy} onEnd={onEnd} />
    </form>
  );
}

const LIMIT_FIELDS = [
  { key: "jobs", title: "Jobs at the same time", about: ABOUT.jobs, mode: "numeric" },
  { key: "storage", title: "Space for layers (GB)", about: ABOUT.storage, mode: "decimal" },
  { key: "layer", title: "Largest layer (GB)", about: ABOUT.layer, mode: "decimal" },
] as const;

/**
 * The fields that set the limits of a server: the jobs that run at the same time, the space for its layers and
 * the largest size of one layer, with the sizes in gigabytes. The error of a field shows after the field is
 * left or the button is pressed. The project server keeps the new limits and passes them to the server, which
 * applies them; `onSet` receives them, so that the list can say that they are on their way.
 */
function LimitsForm({
  server,
  limits,
  onEnd,
  onSet,
}: FormProps & { limits: ServerLimits; onSet: (limits: ServerLimits) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<LimitsDraft>(() => draftOf(limits));
  const [left, setLeft] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const faults = limitsFaults(draft);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setLeft(LIMIT_FIELDS.map(({ key }) => key));
    const next = limitsOf(draft);
    if (next === null) {
      return;
    }
    setRefusal(null);
    setBusy(true);
    setServerLimits(server.id, next).then(
      () => {
        report("info", sentWords(server));
        onSet(next);
        onEnd();
      },
      (error: unknown) => {
        setRefusal(wordsOf(error, "The limits of the server could not be set."));
        setBusy(false);
      },
    );
  };

  return (
    <form className="usa-form server-form" onSubmit={submit} noValidate>
      {LIMIT_FIELDS.map(({ key, title, about, mode }, index) => {
        const field = `${id}-${key}`;
        const fault = left.includes(key) ? faults[key] : null;
        return (
          <div key={key} className="server-field">
            <FieldTitle field={field} title={title}>
              {about}
            </FieldTitle>
            <input
              className={fault ? "usa-input usa-input--error" : "usa-input"}
              id={field}
              value={draft[key]}
              inputMode={mode}
              autoComplete="off"
              autoFocus={index === 0}
              aria-invalid={fault ? true : undefined}
              aria-describedby={describedBy(infoId(field), fault && `${field}-fault`)}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              onBlur={() => setLeft(left.includes(key) ? left : [...left, key])}
            />
            <FieldError id={`${field}-fault`}>{fault}</FieldError>
          </div>
        );
      })}
      {refusal ? <Notice kind="error">{refusal}</Notice> : null}
      <FormButtons label="Set limits" busy={busy} onEnd={onEnd} />
    </form>
  );
}

/**
 * The confirmation of the removal of a server. It says what happens to the jobs and the layers of the server:
 * the jobs leave the list of jobs, the files of the layers stay on that computer, and the layers leave the lists
 * and the map of the site.
 */
function RemoveForm({ server, onEnd }: FormProps) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setRefusal(null);
    setBusy(true);
    removeServer(server.id).then(
      () => report("info", `The server "${server.name}" was removed from your account.`),
      (error: unknown) => {
        setRefusal(wordsOf(error, "The server could not be removed."));
        setBusy(false);
      },
    );
  };

  return (
    <form className="usa-form server-form" onSubmit={submit} noValidate>
      <Notice kind="warning">
        The server &quot;{server.name}&quot; leaves your account, and Lynkeus Server on that computer forgets the
        connection. {removalWords(server.state?.layers ?? null)}
      </Notice>
      {refusal ? <Notice kind="error">{refusal}</Notice> : null}
      <FormButtons label="Remove" busy={busy} danger onEnd={onEnd} />
    </form>
  );
}

/**
 * One server of the list: its name, whether it is connected and since when it is not, and what it reports about
 * itself. Its three commands stand in a toolbar: Rename, Set limits and Remove. Each one shows its form in the
 * place of the report, and the form ends with its button or with Cancel. A server whose layers use the space
 * that its limit allows says so, and so does a server that does not report yet the limits that were set here.
 */
export function ServerItem({ server }: { server: Server }) {
  const item = useRef<HTMLLIElement>(null);
  const refocus = useRef(false);
  const [mode, setMode] = useState<"shown" | "rename" | "limits" | "remove">("shown");
  const limits = server.state?.limits ?? null;
  const problem = storageProblem(server.name, server.state);
  // The limits that the visitor set here and that the server does not report yet.
  const [set, setSet] = useState<ServerLimits | null>(null);
  const pending = set !== null && !(limits && sameLimits(set, limits)) ? set : null;
  const shown = mode === "limits" && limits === null ? "shown" : mode;

  // The focus returns to the commands of the server after a form has closed.
  useEffect(() => {
    if (shown === "shown" && refocus.current) {
      refocus.current = false;
      item.current?.querySelector<HTMLElement>(".item-actions .icon-button")?.focus();
    }
  }, [shown]);

  const end = () => {
    refocus.current = true;
    setMode("shown");
  };

  return (
    <li ref={item} className={server.connected ? "item server server--connected" : "item server"}>
      <div className="item-main">
        <p className="item-title">
          <Icon name={server.connected ? "link" : "link_off"} /> {server.name}
        </p>
        <p className="item-line">{connectionWords(server)}</p>
        {shown === "rename" ? <RenameForm server={server} onEnd={end} /> : null}
        {shown === "limits" && limits ? (
          <LimitsForm server={server} limits={pending ?? limits} onEnd={end} onSet={setSet} />
        ) : null}
        {shown === "remove" ? <RemoveForm server={server} onEnd={end} /> : null}
        {shown === "shown" ? (
          <>
            {problem === null ? null : <Notice kind="warning">{problem}</Notice>}
            {pending === null ? null : <Notice kind="info">{pendingWords(pending)}</Notice>}
            {server.state === null ? <Notice kind="info">The server has not reported its state yet.</Notice> : null}
            <PropertyList groups={serverGroups(server)} />
          </>
        ) : null}
      </div>
      <div className="item-actions">
        <Toolbar label={`Commands of the server ${server.name}`}>
          <IconButton icon="edit" label="Rename" onClick={() => setMode("rename")} />
          <IconButton
            icon="settings"
            label="Set limits"
            disabled={limits === null}
            reason="The server has not reported its limits yet."
            onClick={() => setMode("limits")}
          />
          <IconButton icon="delete" label="Remove" onClick={() => setMode("remove")} />
        </Toolbar>
      </div>
    </li>
  );
}
