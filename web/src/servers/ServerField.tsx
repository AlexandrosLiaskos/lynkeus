import { useEffect, useId, useState } from "react";
import { layersStore } from "../data/layers";
import { loadLimits, type ServiceLimits } from "../header/notice/limits";
import { amount, countWords, sizeWords } from "../header/notice/numbers";
import { describedBy } from "../shared/field/FieldError";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Notice } from "../shared/notice/Notice";
import { PropertyList, type Property } from "../shared/properties/PropertyList";
import { PROJECT_SERVER, PROJECT_SERVER_WORDS, serversStore } from "../shared/servers";
import { useStore } from "../shared/store";
import { cellsLimitOf, chosenOf, holdersOf, type CellsLimit, type Chosen } from "./choice";
import { loadServers } from "./requests";
import { AUTOMATIC, serverChoiceStore } from "./state";
import { limitRows, storageProblem } from "./words";

/** The explanation of the field. It shows from the button beside its title. */
export const ABOUT_SERVER =
  "The server that runs the job and keeps its layer: the project server of Lynkeus, or one of your servers. Automatic takes your connected server with the fewest waiting and running jobs that keeps every input layer, and the project server when there is none. The limits under the field are those of the server chosen.";

/** Return the limits of the project server that a form shows, as names and values. */
export function projectRows({ limits }: ServiceLimits): Property[] {
  return [
    { name: "Jobs at the same time", value: `${countWords(limits.running_jobs)} for all visitors` },
    { name: "Largest layer", value: sizeWords(limits.layer_size) },
    { name: "Most cells of a layer", value: countWords(limits.layer_cells) },
    {
      name: "Space for layers",
      value: `${sizeWords(limits.session_size)} and ${amount(limits.session_layers, "layer", "layers")} for one session`,
    },
  ];
}

/** What a form that starts a job needs of the choice of the server. */
export interface ServerChoice {
  /** The parameter `server` of the execution, or undefined when none is sent. */
  parameter: string | undefined;
  /** What the choice lacks before a job can start there, in one sentence, or null. */
  missing: string | null;
}

function useChosen(inputs: readonly string[]): Chosen | null {
  const listed = useStore(serversStore);
  const choice = useStore(serverChoiceStore);
  const entries = useStore(layersStore);
  // A visitor without an own server has no choice to make: the job goes to the project server.
  if (!listed || listed.servers.length === 0) {
    return null;
  }
  return chosenOf(choice, listed.servers, holdersOf(inputs, entries));
}

/**
 * Read the choice of the server in a form that starts a job. `inputs` holds the ids of the input layers of a
 * tool; the form of Get layer has none. A visitor without an own server sends no parameter.
 */
export function useServerChoice(inputs: readonly string[] = []): ServerChoice {
  const chosen = useChosen(inputs);
  return { parameter: chosen?.parameter, missing: chosen?.missing ?? null };
}

/**
 * Read the limit on the cells of a layer for the job that a form would start: the limit of the server chosen,
 * of the server that Automatic names, or the number of the project server, which the form gives in `project`.
 * `inputs` holds the ids of the input layers of a tool, as for `useServerChoice`.
 */
export function useCellsLimit(project: number | null, inputs: readonly string[] = []): CellsLimit {
  const servers = useStore(serversStore)?.servers ?? [];
  return cellsLimitOf(useChosen(inputs), servers, project);
}

/**
 * The field Server of a form that starts a job: Automatic, the project server, or one of the own servers of
 * the visitor. It is shown only to a visitor who has an own server. Under the field stand the limits of the
 * server chosen, and what the form must not hide: a chosen server that is not connected, a server whose layers
 * use the space that its limit allows, and input layers that are kept on another server. Every form shows and
 * changes the same choice.
 *
 * `inputs` holds the ids of the input layers of a tool, in the list of layers of the Catalog pane.
 */
export function ServerField({ inputs = [] }: { inputs?: readonly string[] }) {
  const id = useId();
  const servers = useStore(serversStore)?.servers ?? [];
  const chosen = useChosen(inputs);
  const [project, setProject] = useState<ServiceLimits | null>(null);
  const onProject = chosen !== null && chosen.server === null;

  // The servers are read again when the form opens, so that the field shows their present state.
  useEffect(() => {
    void loadServers();
  }, []);

  // The limits of the project server are asked for when the job would run there.
  useEffect(() => {
    if (!onProject) {
      return;
    }
    let current = true;
    loadLimits().then(
      (limits) => {
        if (current) {
          setProject(limits);
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [onProject]);

  if (chosen === null) {
    return null;
  }

  const { server } = chosen;
  const automatic: Property[] =
    chosen.choice === AUTOMATIC
      ? [{ name: "At present", value: server === null ? PROJECT_SERVER_WORDS : server.name }]
      : [];
  const limits: Property[] =
    server === null ? (project ? projectRows(project) : []) : server.state ? limitRows(server.state) : [];
  const problems = [
    chosen.missing === null || server === null
      ? null
      : `The server "${server.name}" is not connected. Start Lynkeus Server on that computer, or choose another server.`,
    server === null ? null : storageProblem(server.name, server.state),
    chosen.apart,
  ].filter((problem) => problem !== null);

  return (
    <div className="server-choice">
      <FieldTitle field={id} title="Server">
        {ABOUT_SERVER}
      </FieldTitle>
      <select
        className="usa-select"
        id={id}
        value={chosen.choice}
        aria-describedby={describedBy(infoId(id), problems.length > 0 ? `${id}-problems` : null)}
        onChange={(event) => serverChoiceStore.set(event.target.value)}
      >
        <option value={AUTOMATIC}>Automatic</option>
        <option value={PROJECT_SERVER}>{PROJECT_SERVER_WORDS}</option>
        {servers.map(({ id: name, name: title, connected }) => (
          <option key={name} value={name}>
            {connected ? title : `${title} (not connected)`}
          </option>
        ))}
      </select>
      <div id={`${id}-problems`}>
        {problems.map((problem) => (
          <Notice key={problem} kind="warning">
            {problem}
          </Notice>
        ))}
      </div>
      {server !== null && server.state === null ? (
        <Notice kind="info">The server &quot;{server.name}&quot; has not reported its state yet.</Notice>
      ) : null}
      {automatic.length + limits.length > 0 ? <PropertyList groups={[{ rows: [...automatic, ...limits] }]} /> : null}
    </div>
  );
}
