import type { LayerEntry } from "../data/layers";
import { PROJECT_SERVER, type Server } from "../shared/servers";
import { AUTOMATIC, serverParameter, validChoice } from "./state";

/** What follows from the choice of the field Server of a tool, among the servers of the visitor. */
export interface Chosen {
  /** The choice that holds: `AUTOMATIC`, `PROJECT_SERVER` or the name of an own server. */
  choice: string;
  /** The parameter `server` of the execution, or undefined for the automatic choice. */
  parameter: string | undefined;
  /**
   * The own server on which the job runs, or null for the project server. For the automatic choice it is the
   * server that the rule of the project server gives at this moment.
   */
  server: Server | null;
  /** What the choice lacks before a job can start there, in one sentence, or null. */
  missing: string | null;
  /** Why the project server will refuse the input layers on this server, in at most two sentences, or null. */
  apart: string | null;
}

/**
 * Return, for each input layer of a tool, the name of the own server that keeps it, or null for a layer of the
 * project server. A layer that the list of layers does not hold counts as a layer of the project server.
 */
export function holdersOf(inputs: readonly string[], entries: readonly LayerEntry[]): (string | null)[] {
  return inputs.map((id) => entries.find((entry) => entry.layer.id === id)?.server?.id ?? null);
}

/** Return the number of jobs of a server that wait or run, as it last reported them. */
function unfinished(server: Server): number {
  return server.state ? server.state.running + server.state.waiting : 0;
}

/**
 * Return the server to which the project server sends a job without the parameter `server`: the connected own
 * server with the fewest unfinished jobs that keeps every input layer, or null for the project server when
 * there is none (`docs/Own_Servers.md`, Addresses for the interface). Of two servers with the same number of
 * jobs the first of the list is taken here; the project server decides when the job starts.
 */
export function automaticServer(servers: readonly Server[], holders: readonly (string | null)[]): Server | null {
  let best: Server | null = null;
  for (const server of servers) {
    if (
      server.connected &&
      holders.every((holder) => holder === server.id) &&
      (best === null || unfinished(server) < unfinished(best))
    ) {
      best = server;
    }
  }
  return best;
}

/**
 * Return what follows from a choice of server for a job with the given input layers. `holders` names the
 * server of each input layer, as `holdersOf` gives it. A job runs on one server, and a tool takes the input
 * layers of that server only.
 */
export function chosenOf(choice: string, servers: readonly Server[], holders: readonly (string | null)[]): Chosen {
  const valid = validChoice(choice, servers);
  const parameter = serverParameter(valid);
  if (valid === AUTOMATIC) {
    const apart =
      new Set(holders).size > 1
        ? "The input layers are kept on different servers. A tool takes the input layers of one server."
        : null;
    return { choice: valid, parameter, server: automaticServer(servers, holders), missing: null, apart };
  }
  const server = valid === PROJECT_SERVER ? null : (servers.find((other) => other.id === valid) ?? null);
  const apart = holders.some((holder) => holder !== (server?.id ?? null))
    ? "An input layer is kept on another server. A tool takes the input layers of the server on which it runs, so choose Automatic or the server of the layers."
    : null;
  const missing =
    server !== null && !server.connected ? `Choose a server that is connected: "${server.name}" is not.` : null;
  return { choice: valid, parameter, server, missing, apart };
}
