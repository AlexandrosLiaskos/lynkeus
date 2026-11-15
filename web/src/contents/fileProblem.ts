import { findServer, serverOfAddress } from "../shared/servers";

/** Why the file of a layer cannot be read, for the Contents pane. */
export interface LayerProblem {
  /** The reason, in one sentence for the visitor. */
  text: string;
  /** Whether the same file may be readable later, so that the layer offers to try again. */
  again: boolean;
}

/** The sentence for a file that cannot be read for a reason that the page does not know. */
export const UNREADABLE = "The file of the layer could not be read.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the words that name the own server of an address: its name where the list of the servers holds it. */
function serverWords(id: string): string {
  const server = findServer(id);
  return server ? `Your server "${server.name}"` : "Your server";
}

/**
 * Return why an answer of the site to a request for the file of a layer gives no file, or null for an answer
 * that gives the file. The file of a layer of an own server passes through the project server, which answers
 * 503 while that server is not connected, 504 when it does not answer in time and 401 when the visitor is not
 * signed in to Earthdata (`docs/Own_Servers.md`). The sentence of the answer is shown where it has one.
 *
 * @param address The address of the file, as the description of the layer gives it.
 * @param status The status code of the answer.
 * @param detail The sentence of the answer for the visitor, or null when it has none.
 */
export function problemOfAnswer(address: string, status: number, detail: string | null): LayerProblem | null {
  if (status >= 200 && status < 300) {
    return null;
  }
  const server = serverOfAddress(address);
  if (status === 404 || status === 410) {
    return { text: detail ?? "The file of the layer no longer exists.", again: false };
  }
  if (server !== null && status === 401) {
    return {
      text: `${serverWords(server)} keeps this layer, and its files are read only while you are signed in to Earthdata. Sign in and try again.`,
      again: true,
    };
  }
  if (server !== null && status === 503) {
    return {
      text:
        detail ??
        `${serverWords(server)}, which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again.`,
      again: true,
    };
  }
  if (server !== null && status === 504) {
    return {
      text:
        detail ??
        `${serverWords(server)}, which keeps this layer, did not answer in time. Check its connection and try again.`,
      again: true,
    };
  }
  return { text: detail ?? `${UNREADABLE} The server answered ${String(status)}.`, again: true };
}

/**
 * Ask the site why the file of a layer cannot be read: the first byte of the file is requested, and the answer
 * tells the reason (see `problemOfAnswer`). The promise gives null when the file can be read after all, and it
 * is never rejected: without an answer the reason is that the server of Lynkeus did not answer.
 */
export async function fileProblem(address: string): Promise<LayerProblem | null> {
  let response: Response;
  try {
    response = await fetch(address, { headers: { Range: "bytes=0-0" }, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { text: "The server of Lynkeus did not answer, so the file of the layer could not be read.", again: true };
  }
  if (response.ok) {
    return null;
  }
  const answer: unknown = await response.json().catch(() => null);
  const detail = isRecord(answer) && typeof answer.detail === "string" && answer.detail !== "" ? answer.detail : null;
  return problemOfAnswer(address, response.status, detail);
}
