import { expect, test, vi } from "vitest";
import { loadVisits, VISIT_KEY } from "./visits";

/** A counter that answers every request with the given body. */
function counter(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

test("a browser is counted at its first visit and only reads the total afterwards", async () => {
  const request = counter({ count: 41 });
  expect(window.localStorage.getItem(VISIT_KEY)).toBeNull();
  expect(await loadVisits(request)).toBe(41);
  expect(request.mock.calls[0]?.[0]).toBe("/api/visit");
  expect(request.mock.calls[0]?.[1]?.method).toBe("POST");
  expect(window.localStorage.getItem(VISIT_KEY)).not.toBeNull();
  expect(await loadVisits(request)).toBe(41);
  expect(request.mock.calls[1]?.[1]?.method).toBe("GET");
});

test("an answer without a valid total is refused and the browser is not marked", async () => {
  await expect(loadVisits(counter({ count: -1 }))).rejects.toThrow("no valid total");
  await expect(loadVisits(counter({}))).rejects.toThrow("no valid total");
  await expect(loadVisits(counter({ count: 1 }, 503))).rejects.toThrow("answered 503");
  expect(window.localStorage.getItem(VISIT_KEY)).toBeNull();
});
