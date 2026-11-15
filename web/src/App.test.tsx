// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApp } from "./App";
import { SLIDE_TIME } from "./welcome/Welcome";
import { WELCOME } from "./welcome/welcome";

// The visit is not counted in these tests.
vi.mock("./welcome/visits", () => ({ visits: () => new Promise<number>(() => undefined) }));

/** The time between two frames of the browser of the test, in milliseconds. */
const FRAME = 16;

/** A platform for the tests: one element, which tells its owner when it stands in the document. */
function Platform({ onMounted }: { onMounted?: () => void }) {
  useEffect(() => {
    onMounted?.();
  }, [onMounted]);
  return <main>The platform</main>;
}

/** The file of that platform, which has arrived already. */
const arrived = () => Promise.resolve({ Platform });

/** An entrance of the welcome screen that ends when the test says so. */
function entrance() {
  let end: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    end = resolve;
  });
  const part = { finished, effect: { getTiming: () => ({ iterations: 1 }) } } as unknown as Animation;
  vi.spyOn(Element.prototype, "getAnimations").mockReturnValue([part]);
  return end;
}

/** Let a time pass, in milliseconds, with everything that waits for it. */
const pass = (time: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(time);
  });

const welcome = () => screen.getByRole<HTMLDialogElement>("dialog", { name: `${WELCOME.name}: ${WELCOME.subtitle}` });
const leaving = () => welcome().classList.contains("welcome-leaving");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("the file of the platform is asked for when the welcome screen has been painted", async () => {
  const load = vi.fn(() => new Promise<never>(() => undefined));
  const App = createApp(load);
  render(<App />);
  expect(welcome().open).toBe(true);
  expect(load).not.toHaveBeenCalled();
  await pass(FRAME);
  expect(load).not.toHaveBeenCalled();
  await pass(FRAME);
  expect(load).toHaveBeenCalledTimes(1);
});

test("the platform is not drawn while the welcome screen appears, and is drawn when the entrance has ended", async () => {
  const end = entrance();
  const App = createApp(arrived);
  render(<App />);
  // The entrance starts when the image and the typeface are at hand, and it runs for as long as the test says.
  await pass(1200);
  await pass(5000);
  expect(screen.queryByRole("main")).toBeNull();
  end();
  await pass(0);
  expect(screen.getByRole("main")).toBeDefined();
  // The screen lifts only when the browser has painted the platform under it.
  expect(welcome().classList.contains("welcome-hinting")).toBe(false);
  await pass(2 * FRAME);
  expect(welcome().classList.contains("welcome-hinting")).toBe(true);
  expect(leaving()).toBe(false);
});

test("for a visitor who enters during the entrance, the platform is drawn and painted before the slide starts", async () => {
  entrance();
  const App = createApp(arrived);
  render(<App />);
  await pass(1200);
  fireEvent.click(screen.getByRole("button", { name: WELCOME.enter }));
  expect(leaving()).toBe(false);
  await pass(0);
  expect(screen.getByRole("main")).toBeDefined();
  expect(leaving()).toBe(false);
  await pass(FRAME);
  expect(leaving()).toBe(false);
  await pass(FRAME);
  expect(leaving()).toBe(true);
  // The screen closes when it has left the window, and a closed dialog is not found by its role any more.
  const dialog = welcome();
  expect(dialog.open).toBe(true);
  await pass(SLIDE_TIME);
  expect(dialog.open).toBe(false);
});

test("the slide waits for the file of the platform, and the screen stays as it is meanwhile", async () => {
  let arrive: (file: { Platform: typeof Platform }) => void = () => undefined;
  const file = new Promise<{ Platform: typeof Platform }>((resolve) => {
    arrive = resolve;
  });
  const App = createApp(() => file);
  render(<App />);
  fireEvent.keyDown(welcome(), { key: "Enter" });
  await pass(10000);
  expect(screen.queryByRole("main")).toBeNull();
  expect(leaving()).toBe(false);
  expect(welcome().open).toBe(true);
  arrive({ Platform });
  await pass(0);
  expect(screen.getByRole("main")).toBeDefined();
  expect(leaving()).toBe(false);
  await pass(2 * FRAME);
  expect(leaving()).toBe(true);
});

test("a file of the platform that does not arrive loads the page again, once", async () => {
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
  const App = createApp(() => Promise.reject(new Error("The file did not arrive.")));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: WELCOME.enter }));
  await pass(2 * FRAME);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(leaving()).toBe(false);
  expect(welcome().open).toBe(true);
});

test("a page that was loaded again already keeps its welcome screen when the file does not arrive", async () => {
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" } as PerformanceNavigationTiming]);
  const App = createApp(() => Promise.reject(new Error("The file did not arrive.")));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: WELCOME.enter }));
  await pass(2 * FRAME);
  expect(reload).not.toHaveBeenCalled();
  expect(welcome().open).toBe(true);
});
