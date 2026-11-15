import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SLIDE_TIME, Welcome } from "./Welcome";
import { WELCOME } from "./welcome";

const NAME = `${WELCOME.name}: ${WELCOME.subtitle}`;

/** A counter of visits that never answers, for the tests that do not read the total. */
const silent = () => new Promise<number>(() => undefined);

afterEach(() => {
  vi.useRealTimers();
});

test("the page opens under the welcome screen, which carries the name of the platform", async () => {
  render(<Welcome load={() => Promise.resolve(1234)} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  expect(dialog.open).toBe(true);
  expect(screen.getByRole("heading", { level: 2, name: WELCOME.name })).toBeDefined();
  expect(screen.getByText(WELCOME.subtitle)).toBeDefined();
  expect(dialog.querySelector(".welcome-image")?.getAttribute("src")).toBe("/assets/welcome/nisar.webp");
  expect(screen.getByText(WELCOME.image.credit)).toBeDefined();
  expect(await screen.findByText("1,234")).toBeDefined();
});

test("every member, the signature, the event and every logo is a link", () => {
  render(<Welcome load={silent} />);
  // The team lead is a member and the developer of the site, so two links carry his name.
  const link = (name: string) => screen.getAllByRole("link", { name })[0];
  expect(WELCOME.team.map(({ label }) => link(label)?.getAttribute("href"))).toEqual([
    "https://liaskos.eu/",
    "mailto:simoste2008@gmail.com",
    "mailto:andreasliaskos7@gmail.com",
  ]);
  expect(WELCOME.team.map(({ label }) => link(label)?.querySelector("img")?.getAttribute("src"))).toEqual([
    "/assets/welcome/alexandros-liaskos.webp",
    "/assets/welcome/stelios-simiakos.webp",
    "/assets/welcome/andreas-liaskos.webp",
  ]);
  expect(screen.getAllByRole("link", { name: "Site of Alexandros Liaskos" })).toHaveLength(2);
  expect(link("NASA Space Apps Challenge Hackathon")?.getAttribute("href")).toBe(
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

test("the screen says so when the counter of visits gives no answer", async () => {
  render(<Welcome load={() => Promise.reject(new Error("No answer."))} />);
  expect((await screen.findByRole("status")).textContent).toBe("not available");
});

test("the arrow at the foot slides the screen up, and the screen closes when it has left the window", () => {
  vi.useFakeTimers();
  render(<Welcome load={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.click(screen.getByRole("button", { name: "Enter Lynkeus" }));
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
  expect(dialog.open).toBe(true);
  act(() => {
    vi.advanceTimersByTime(SLIDE_TIME);
  });
  expect(dialog.open).toBe(false);
});

test("the Up key and a scroll slide the screen up, and a key on a link does not", () => {
  render(<Welcome load={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.keyDown(screen.getByRole("link", { name: "Email Stelios Simiakos" }), { key: "Enter" });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  fireEvent.keyDown(dialog, { key: "ArrowUp" });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});

test("a scroll downward slides the screen up", () => {
  render(<Welcome load={silent} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  fireEvent.wheel(dialog, { deltaY: -100 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(false);
  fireEvent.wheel(dialog, { deltaY: 100 });
  expect(dialog.classList.contains("welcome-leaving")).toBe(true);
});
