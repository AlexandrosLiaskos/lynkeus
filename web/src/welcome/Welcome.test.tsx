// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SLIDE_TIME, Welcome } from "./Welcome";
import { WELCOME } from "./welcome";

const NAME = `${WELCOME.name}: ${WELCOME.subtitle}`;

/** A counter of visits that never answers, for the tests that do not read the total. */
const silent = () => new Promise<number>(() => undefined);

/**
 * An animation of the screen, as the browser lists it. It ends or is taken away when the test says so, and with
 * `Infinity` it repeats without end.
 */
function animation(iterations = 1) {
  let end: () => void = () => undefined;
  let remove: () => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    end = resolve;
    remove = () => {
      reject(new Error("The animation was taken away."));
    };
  });
  const part = { finished, effect: { getTiming: () => ({ iterations }) } } as unknown as Animation;
  return { part, end, remove };
}

/** Let the browser of the test list these animations for the screen. */
function moving(...parts: Animation[]) {
  vi.spyOn(Element.prototype, "getAnimations").mockReturnValue(parts);
}

/** Let a time pass, in milliseconds, with everything that waits for it. */
const pass = (time: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(time);
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("the page opens under the welcome screen, which carries the mark and the name of the platform", () => {
  const count = vi.fn(() => Promise.resolve(1234));
  render(<Welcome count={count} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  expect(dialog.open).toBe(true);
  expect(screen.getByRole("heading", { level: 2, name: WELCOME.name })).toBeDefined();
  expect(screen.getByText(WELCOME.subtitle)).toBeDefined();
  expect(dialog.querySelector(".welcome-image")?.getAttribute("src")).toBe("/assets/welcome/nisar.webp");
  expect(screen.getByText(WELCOME.image.credit)).toBeDefined();
  expect(dialog.querySelector(".welcome-mark")?.getAttribute("src")).toBe("/assets/lynkeus-mark-white.svg");
  // The visit is counted, and the screen shows neither the total nor the developer of the site.
  expect(count).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("Website developed by")).toBeNull();
});

test("every member, the event and every logo is a link", () => {
  render(<Welcome count={silent} />);
  const link = (name: string) => screen.getByRole("link", { name });
  expect(WELCOME.team.map(({ label }) => link(label).getAttribute("href"))).toEqual([
    "https://liaskos.eu/",
    "mailto:simoste2008@gmail.com",
    "mailto:andreasliaskos7@gmail.com",
  ]);
  expect(WELCOME.team.map(({ label }) => link(label).querySelector("img")?.getAttribute("src"))).toEqual([
    "/assets/welcome/alexandros-liaskos.webp",
    "/assets/welcome/stelios-simiakos.webp",
    "/assets/welcome/andreas-liaskos.webp",
  ]);
  expect(link("NASA Space Apps Challenge Hackathon").getAttribute("href")).toBe(
    "https://www.spaceappschallenge.org/2026/local-events/athens/",
  );
  expect(screen.getByText(/Athens, 14–15 November 2026/)).toBeDefined();
  for (const { name, file, address } of WELCOME.logos) {
    const logo = screen.getByRole("img", { name });
    expect(logo.getAttribute("src")).toBe(`/assets/welcome/${file}`);
    expect(logo.closest("a")?.getAttribute("href")).toBe(address);
  }
  // A link that leaves the site opens in another tab and gives the site no way back to this page.
  for (const each of screen.getAllByRole("link")) {
    const leaves = each.getAttribute("href")?.startsWith("https://") ?? false;
    expect(each.getAttribute("target")).toBe(leaves ? "_blank" : null);
    expect(each.getAttribute("rel")).toBe(leaves ? "noreferrer" : null);
  }
});

test("the button at the foot slides the screen up, and the screen closes when it has left the window", () => {
  vi.useFakeTimers();
  render(<Welcome count={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.click(screen.getByRole("button", { name: "Enter the Platform" }));
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
  expect(dialog.open).toBe(true);
  act(() => {
    vi.advanceTimersByTime(SLIDE_TIME);
  });
  expect(dialog.open).toBe(false);
});

test("the Up key and a scroll slide the screen up, and a key on a link does not", () => {
  render(<Welcome count={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.keyDown(screen.getByRole("link", { name: "Email Stelios Simiakos" }), { key: "Enter" });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  fireEvent.keyDown(dialog, { key: "ArrowUp" });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});

test("a scroll downward slides the screen up", () => {
  render(<Welcome count={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.wheel(dialog, { deltaY: -100 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  fireEvent.wheel(dialog, { deltaY: 100 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});

test("a click anywhere on the screen opens the page, and a click on the note of the image does not", () => {
  render(<Welcome count={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  const note = screen.getByRole("note");
  fireEvent.pointerDown(note, { button: 0, clientY: 300 });
  fireEvent.pointerUp(note, { button: 0, clientY: 300 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  expect(dialog.classList.contains("welcome-hinting")).toBe(true);
  fireEvent.pointerDown(dialog, { button: 0, clientY: 300 });
  expect(dialog.classList.contains("welcome-hinting")).toBe(false);
  fireEvent.pointerUp(dialog, { button: 0, clientY: 302 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});

test("a short drag lets the screen return, and a drag upward opens the page", () => {
  render(<Welcome count={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.pointerDown(dialog, { button: 0, clientY: 300 });
  fireEvent.pointerUp(dialog, { button: 0, clientY: 260 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  fireEvent.pointerDown(dialog, { button: 0, clientY: 300 });
  fireEvent.pointerUp(dialog, { button: 0, clientY: 150 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});

test("a key that writes a character opens the page, and the Tab key or a command of the browser does not", () => {
  render(<Welcome count={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.keyDown(dialog, { key: "Tab" });
  fireEvent.keyDown(dialog, { key: "F5" });
  fireEvent.keyDown(dialog, { key: "r", ctrlKey: true });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  fireEvent.keyDown(dialog, { key: "a" });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});

test("the screen takes the place of the dark ground of the first paint", () => {
  const ground = document.createElement("div");
  ground.id = "cover";
  document.body.append(ground);
  render(<Welcome count={silent} />);
  expect(screen.getByRole<HTMLDialogElement>("dialog", { name: NAME }).open).toBe(true);
  expect(document.getElementById("cover")).toBeNull();
});

test("the owner is told when the entrance of the screen has ended, and not while it runs", async () => {
  vi.useFakeTimers();
  const image = animation();
  const button = animation();
  const strokes = animation(Infinity);
  moving(image.part, button.part, strokes.part);
  const onSettled = vi.fn();
  render(<Welcome count={silent} onSettled={onSettled} />);
  // The entrance starts at once or, where the image and the typeface cannot be asked for, a moment later.
  await pass(1200);
  await pass(5000);
  expect(onSettled).not.toHaveBeenCalled();
  image.end();
  await pass(0);
  expect(onSettled).not.toHaveBeenCalled();
  // An animation that is taken away has ended as well, and the strokes that repeat without end are not waited for.
  button.remove();
  await pass(0);
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test("where nothing moves, the owner is told as soon as the image and the typeface are at hand", async () => {
  vi.useFakeTimers();
  const onSettled = vi.fn();
  render(<Welcome count={silent} onSettled={onSettled} />);
  expect(onSettled).not.toHaveBeenCalled();
  await pass(1200);
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test("the owner is told at once when the visitor enters before the screen has appeared in full", () => {
  const onSettled = vi.fn();
  render(<Welcome count={silent} onSettled={onSettled} />);
  fireEvent.click(screen.getByRole("button", { name: "Enter the Platform" }));
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test("the owner is told at the press that starts a click or a drag", () => {
  const onSettled = vi.fn();
  render(<Welcome count={silent} onSettled={onSettled} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.pointerDown(dialog, { button: 0, clientY: 300 });
  expect(onSettled).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(dialog, { button: 0, clientY: 300 });
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test("the screen stays as it is until the page stands under it, and slides away then", () => {
  vi.useFakeTimers();
  const { rerender } = render(<Welcome count={silent} standing={false} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.keyDown(dialog, { key: "Enter" });
  act(() => {
    vi.advanceTimersByTime(10 * SLIDE_TIME);
  });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  expect(dialog.open).toBe(true);
  rerender(<Welcome count={silent} standing />);
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
  expect(dialog.open).toBe(true);
  act(() => {
    vi.advanceTimersByTime(SLIDE_TIME);
  });
  expect(dialog.open).toBe(false);
});

test("the screen lifts only over a page that stands under it", () => {
  const { rerender } = render(<Welcome count={silent} standing={false} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  expect(dialog.classList.contains("welcome-hinting")).toBe(false);
  rerender(<Welcome count={silent} standing />);
  expect(dialog.classList.contains("welcome-hinting")).toBe(true);
});

test("a drag does not move the screen before the page stands under it", () => {
  const { rerender } = render(<Welcome count={silent} standing={false} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.pointerDown(dialog, { button: 0, clientY: 300 });
  fireEvent.pointerMove(dialog, { clientY: 200 });
  expect(dialog.style.transform).toBe("");
  rerender(<Welcome count={silent} standing />);
  fireEvent.pointerMove(dialog, { clientY: 200 });
  expect(dialog.style.transform).toBe("translateY(-100px)");
});
