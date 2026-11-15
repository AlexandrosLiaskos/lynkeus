import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { loadSeries, resetSeries, SERIES_PANE, seriesFaultStore, seriesStore, shownSeriesStore } from "../data/series";
import { pairSeries, series, seriesItem } from "../data/testSeries";
import { job, standIn, type StandIn } from "../data/testSession";
import { dockStore, resetDock } from "../shared/dock/dock";
import { messagesStore } from "../shared/messages/messages";
import { ABOUT_SERIES_LIST, seriesLine, seriesRemovalWords, SeriesSection } from "./SeriesSection";

let server: StandIn;

// The sentence with which the server refuses a name (`series_renaming` in `api/src/lynkeus/routes.py`).
const REFUSAL = 'The request body must be {"title": "..."} with a title of 1 to 200 characters.';
const BACKSCATTER = "Backscatter HH, mean of the area";
const COHERENCE = "Coherence HH at p1";

beforeEach(() => {
  resetDock();
  resetJobs();
  resetSeries();
  messagesStore.set([]);
  server = standIn();
});

afterEach(() => {
  resetJobs();
  resetSeries();
  vi.unstubAllGlobals();
});

async function show(items = [seriesItem(pairSeries()), seriesItem()]) {
  server.series = items;
  render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <SeriesSection />
    </>,
  );
  await act(() => loadSeries());
}

const item = (name: RegExp) => screen.getByRole("button", { name });
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);
const commandsOf = (title: string) => within(screen.getByRole("group", { name: `Commands of the series ${title}` }));

/** Open the menu "More" of a series and return the names of its commands. */
async function moreOf(title: string): Promise<string[]> {
  await userEvent.click(commandsOf(title).getByRole("button", { name: `More commands of ${title}` }));
  return screen.getAllByRole("menuitem").map((command) => command.textContent);
}

const choose = (command: string) => userEvent.click(within(screen.getByRole("menu")).getByText(command));

test("without a series the section says how it fills", () => {
  render(<SeriesSection />);
  expect(screen.getByRole("button", { name: "Series (0)" })).toBeDefined();
  expect(screen.getByText("A series is listed when the job of a Series tool has finished.")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
});

test("the explanation of the section has three sentences", () => {
  expect(ABOUT_SERIES_LIST).toBe(
    "The series of this session, which the Series tools of the Analysis tab compute. A series holds the values of many dates, at a point or for the area of its layers. The server keeps a series until it is removed or the session ends.",
  );
});

test("each series shows its name, its quantity with the unit, and its dates with its place", async () => {
  await show();
  expect(screen.getByRole("button", { name: "Series (2)", expanded: true })).toBeDefined();
  expect([...document.querySelectorAll(".layer .catalog-pick")].map((text) => text.textContent)).toEqual([
    "Coherence HH at p1Interferometric coherence (magnitude) (no unit)3 pairs · 15 Sept 2026 to 21 Oct 2026 · At a point",
    "Backscatter HH, mean of the areaRadar backscatter gamma0 (dB)4 dates · 27 Sept 2026 to 2 Nov 2026 · Whole area",
  ]);
  expect(seriesLine(series())).toBe("4 dates · 27 Sept 2026 to 2 Nov 2026 · Whole area");
  expect(seriesLine(pairSeries())).toBe("3 pairs · 15 Sept 2026 to 21 Oct 2026 · At a point");
});

test("the item of a series shows the command Show, and its menu holds Rename and Remove", async () => {
  await show();
  const shown = within(screen.getByRole("group", { name: `Commands of the series ${BACKSCATTER}` }))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent);
  expect(shown).toEqual(["Show", `More commands of ${BACKSCATTER}`]);
  expect(await moreOf(BACKSCATTER)).toEqual(["Rename", "Remove"]);
  await userEvent.keyboard("{Escape}");
  await userEvent.click(commandsOf(BACKSCATTER).getByRole("button", { name: "Show" }));
  expect(shownSeriesStore.get()).toBe(series().id);
  expect(dockStore.get().tools).toContain(SERIES_PANE);
  expect(item(/^Backscatter HH/).getAttribute("aria-pressed")).toBe("true");
  // A click on the text of a series shows it as well.
  await userEvent.click(item(/^Coherence HH/));
  expect(shownSeriesStore.get()).toBe(pairSeries().id);
});

test("a series is renamed in a field that takes the place of its text", async () => {
  await show();
  await moreOf(BACKSCATTER);
  await choose("Rename");
  const field = screen.getByRole<HTMLInputElement>("textbox", { name: "New name" });
  expect(field.value).toBe(BACKSCATTER);
  expect(document.activeElement).toBe(field);
  await userEvent.clear(field);
  await userEvent.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByRole("alert").textContent).toBe("Give the new name of the series.");
  expect(server.sent("PATCH")).toEqual([]);
  await userEvent.type(field, "Backscatter of the estuary{Enter}");
  await vi.waitFor(() => expect(item(/^Backscatter of the estuary/)).toBeDefined());
  expect(server.sent("PATCH")).toEqual([
    { method: "PATCH", address: `/api/series/${series().id}`, content: { title: "Backscatter of the estuary" } },
  ]);
  expect(messages()).toEqual([["info", 'The series was renamed to "Backscatter of the estuary".']]);
  expect(screen.queryByRole("textbox")).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(item(/^Backscatter of the estuary/)));
});

test("a renaming that the server refuses is stated at the field, and Cancel leaves the name", async () => {
  await show();
  server.refuse("PATCH", "/api/series", 400, REFUSAL);
  await moreOf(BACKSCATTER);
  await choose("Rename");
  await userEvent.type(screen.getByRole("textbox", { name: "New name" }), " again{Enter}");
  await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe(REFUSAL));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(item(/^Backscatter HH, mean of the area/)).toBeDefined();
});

test("a series is removed after a confirmation, with the record of its job", async () => {
  await show();
  server.jobs = [job({ jobID: "made", processID: "backscatter-series", status: "successful", series: series().id })];
  await act(() => loadJobs());
  await moreOf(BACKSCATTER);
  await choose("Remove");
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Remove the series" });
  expect(dialog.textContent).toContain(
    'The series "Backscatter HH, mean of the area" is removed from the server. This cannot be undone.',
  );
  expect(seriesRemovalWords(series())).toBe(
    'The series "Backscatter HH, mean of the area" is removed from the server. This cannot be undone.',
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(dialog.open).toBe(false);
  expect(server.sent("DELETE")).toEqual([]);

  await moreOf(BACKSCATTER);
  await choose("Remove");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  await vi.waitFor(() => expect(seriesStore.get().map((entry) => entry.series.id)).toEqual([pairSeries().id]));
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual([`/api/series/${series().id}`]);
  expect(messages()).toEqual([["info", 'The series "Backscatter HH, mean of the area" was removed.']]);
  await vi.waitFor(() => expect(jobsStore.get()).toEqual([]));
  await vi.waitFor(() => expect(dialog.open).toBe(false));
});

test("a removal that the server refuses is reported, and the series stays", async () => {
  await show();
  server.refuse("DELETE", "/api/series", 503, "The server is busy. Try again in a few minutes.");
  await moreOf(COHERENCE);
  await choose("Remove");
  await userEvent.click(
    within(screen.getByRole("dialog", { name: "Remove the series" })).getByRole("button", { name: "Remove" }),
  );
  await vi.waitFor(() => expect(messages()).toEqual([["error", "The server is busy. Try again in a few minutes."]]));
  expect(seriesStore.get()).toHaveLength(2);
});

test("a list that could not be read states the fault and offers a new reading", async () => {
  server.refuse("GET", "/api/series", 503, "The server is busy. Try again in a few minutes.");
  await show();
  expect(seriesFaultStore.get()).toBe("The server is busy. Try again in a few minutes.");
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("The server is busy. Try again in a few minutes.");
  server.accept();
  const notice = alert.closest<HTMLElement>(".notice");
  if (!notice) {
    throw new Error("the fault is not in a notice");
  }
  await userEvent.click(within(notice).getByRole("button", { name: "Read again" }));
  await vi.waitFor(() => expect(seriesStore.get()).toHaveLength(2));
  expect(screen.queryByRole("alert")).toBeNull();
});
