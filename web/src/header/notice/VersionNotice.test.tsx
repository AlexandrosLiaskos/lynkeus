// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { version } from "../../../package.json";
import { NO_ANSWER, UNREADABLE, type ServiceLimits } from "./limits";
import { ASKING, DESCRIPTION, limitSentences, NOT_SHOWN, resourcesSentence, versionSentence } from "./sentences";
import { SAMPLE, sampleWith } from "./testLimits";
import { VersionNotice } from "./VersionNotice";

const NAME = `Version ${version}`;

/** The answer of the server to a page of the present version. */
const SERVICE: ServiceLimits = { ...SAMPLE, version };

function answerWith(status: number, content: unknown) {
  const request = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(content), { status })));
  vi.stubGlobal("fetch", request);
  return request;
}

/** A server whose answers the test gives one by one, each when the test chooses. */
function answersOnRequest() {
  const answers: ((content: unknown) => void)[] = [];
  const request = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        answers.push((content) => resolve(new Response(JSON.stringify(content), { status: 200 })));
      }),
  );
  vi.stubGlobal("fetch", request);
  return { request, answers };
}

async function open(): Promise<HTMLDialogElement> {
  render(<VersionNotice />);
  await userEvent.click(screen.getByRole("button", { name: NAME }));
  return screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
}

function paragraphs(dialog: HTMLElement): (string | null)[] {
  return Array.from(dialog.querySelectorAll("p"), (paragraph) => paragraph.textContent);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the button shows the version of the page alone, with a name and a description", () => {
  const request = answerWith(200, SERVICE);
  render(<VersionNotice />);
  const button = screen.getByRole("button", { name: NAME });
  expect(button.textContent).toBe(version);
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
  expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Shows the state of this version and the limits of its server.",
  );
  expect(screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).open).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test("the notice opens with the version as its heading and says that the server is being read", async () => {
  const { request, answers } = answersOnRequest();
  const dialog = await open();
  expect(dialog.open).toBe(true);
  expect(within(dialog).getByRole("heading", { level: 2, name: NAME })).toBeDefined();
  expect(paragraphs(dialog)).toEqual([versionSentence(version), ASKING, DESCRIPTION]);
  expect(dialog.querySelector("[aria-live]")?.getAttribute("aria-busy")).toBe("true");
  expect(request).toHaveBeenCalledTimes(1);

  await act(async () => {
    answers[0]?.(SERVICE);
    await Promise.resolve();
  });
  expect(await within(dialog).findByText(resourcesSentence(SERVICE.resources))).toBeDefined();
  expect(within(dialog).queryByText(ASKING)).toBeNull();
  expect(dialog.querySelector("[aria-live]")?.getAttribute("aria-busy")).toBe("false");
});

test("the notice is written from the answer of the server", async () => {
  answerWith(200, SERVICE);
  const dialog = await open();
  expect(await within(dialog).findByRole("heading", { level: 3, name: "Limits" })).toBeDefined();
  expect(paragraphs(dialog)).toEqual([versionSentence(version), resourcesSentence(SERVICE.resources), DESCRIPTION]);
  expect(
    within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(limitSentences(SERVICE));
  expect(
    within(dialog).getByText(/^A layer may hold at most 25 million cells, because Lynkeus has 2 GB of memory/),
  ).toBeDefined();
  expect(within(dialog).getByText(/A job may run for at most 40 minutes/)).toBeDefined();
});

test("the notice follows other numbers and another choice of the server", async () => {
  const service = {
    ...sampleWith({ layer_cells: 36000000, larger_layer: "coarser", job_time: 3600 }, { memory: 4294967296 }),
    version,
  };
  answerWith(200, service);
  const dialog = await open();
  expect(
    await within(dialog).findByText(
      "A layer may hold at most 36 million cells, because Lynkeus has 4 GB of memory and runs 2 jobs at once. A larger area is received at a coarser cell size.",
    ),
  ).toBeDefined();
  expect(within(dialog).getByText(/A job may run for at most 1 hour/)).toBeDefined();
  expect(within(dialog).queryByText(/needs more cells is refused/)).toBeNull();
});

test("resources that the server could not read are said to be unread", async () => {
  const service = { ...sampleWith({}, { processors: null, memory: null }), version };
  answerWith(200, service);
  const dialog = await open();
  expect(
    await within(dialog).findByText(
      "The processors and the memory that Lynkeus may use on its server could not be read.",
    ),
  ).toBeDefined();
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(9);
});

test("the notice names the version of the server when it differs from the version of the page", async () => {
  answerWith(200, { ...SAMPLE, version: "99.0.0" });
  const dialog = await open();
  expect(
    await within(dialog).findByText("The server runs version 99.0.0. Reload the page to receive the same version."),
  ).toBeDefined();
  expect(paragraphs(dialog)[0]).toBe(versionSentence(version));
});

test("without an answer of the server the notice says so and still shows the version of the page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  const dialog = await open();
  expect(await within(dialog).findByText(`${NO_ANSWER} ${NOT_SHOWN}`)).toBeDefined();
  expect(paragraphs(dialog)).toEqual([versionSentence(version), `${NO_ANSWER} ${NOT_SHOWN}`, DESCRIPTION]);
  expect(within(dialog).queryByRole("list")).toBeNull();
  expect(within(dialog).queryByRole("heading", { level: 3 })).toBeNull();
});

test("an error of the server and an answer that cannot be read are said in the notice", async () => {
  answerWith(503, { detail: "Service Unavailable" });
  const dialog = await open();
  expect(
    await within(dialog).findByText(`The server of Lynkeus answered with the error 503. ${NOT_SHOWN}`),
  ).toBeDefined();

  await userEvent.click(within(dialog).getByRole("button", { name: "Close this window" }));
  answerWith(200, { status: "ok" });
  await userEvent.click(screen.getByRole("button", { name: NAME }));
  expect(await within(dialog).findByText(`${UNREADABLE} ${NOT_SHOWN}`)).toBeDefined();
});

test("the close button closes the notice, and the notice asks the server again when it opens again", async () => {
  const request = answerWith(200, SERVICE);
  const dialog = await open();
  await within(dialog).findByRole("list");
  await userEvent.click(within(dialog).getByRole("button", { name: "Close this window" }));
  expect(dialog.open).toBe(false);

  const changed = { ...sampleWith({ search_products: 100 }), version };
  request.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(changed), { status: 200 })));
  await userEvent.click(screen.getByRole("button", { name: NAME }));
  expect(dialog.open).toBe(true);
  expect(await within(dialog).findByText(/^A search lists at most 100 products at a time/)).toBeDefined();
  expect(request).toHaveBeenCalledTimes(2);
});

test("the answer to an earlier question is not shown after the notice was opened again", async () => {
  const { answers } = answersOnRequest();
  const dialog = await open();
  await userEvent.click(within(dialog).getByRole("button", { name: "Close this window" }));
  await userEvent.click(screen.getByRole("button", { name: NAME }));
  expect(answers).toHaveLength(2);

  await act(async () => {
    answers[0]?.({ ...sampleWith({ search_products: 100 }), version });
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(within(dialog).queryByRole("list")).toBeNull();
  expect(within(dialog).getByText(ASKING)).toBeDefined();

  await act(async () => {
    answers[1]?.(SERVICE);
    await Promise.resolve();
  });
  expect(await within(dialog).findByText(/^A search lists at most 200 products at a time/)).toBeDefined();
});
