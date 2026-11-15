import { keepInBrowser } from "../shared/storage/storage";

/** The name under which the browser keeps the marker of a counted visit. */
export const VISIT_KEY = "lynkeus.visit";

/** The address of the counter of page visits. */
const COUNTER = "/api/visit";

const listeners = new Set<() => void>();
let counted = false;

/**
 * The marker that this browser has been counted. It is kept as every other part that the browser keeps for the
 * page, so the pane Browser storage lists it, switches it off and clears it. A browser without the marker is
 * counted again at its next visit.
 */
const marker = keepInBrowser<boolean>({
  key: VISIT_KEY,
  title: "Counted visit",
  description: "A marker that this browser has been counted in the total of page visits.",
  read: () => (counted ? true : undefined),
  check: (stored) => (stored === true ? true : undefined),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
});

/**
 * Ask the counter for the total of recorded page visits. A browser without the marker is counted with this
 * request and receives the marker; a browser that has it only reads the total. The server stores the total and
 * nothing of the visitor.
 *
 * @param request The function that sends the request, `fetch` of the browser unless a test gives its own.
 * @returns The total of recorded page visits.
 * @throws Error when the counter gives no answer or no valid total.
 */
export async function loadVisits(request: typeof fetch = fetch): Promise<number> {
  const known = marker.stored() === true;
  const response = await request(COUNTER, { method: known ? "GET" : "POST", headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`The counter of visits answered ${String(response.status)}.`);
  }
  const answer: unknown = await response.json();
  const count = typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>).count : undefined;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new Error("The counter of visits returned no valid total.");
  }
  if (!known) {
    counted = true;
    listeners.forEach((listener) => listener());
  }
  return count;
}

let asked: Promise<number> | undefined;

/** The total of recorded page visits. The counter is asked once for each opening of the page. */
export function visits(): Promise<number> {
  asked ??= loadVisits();
  return asked;
}
