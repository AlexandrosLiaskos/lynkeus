import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Welcome } from "./Welcome";
import { WELCOME } from "./welcome";

const NAME = `${WELCOME.name} ${WELCOME.subtitle}`;

test("the page opens with the welcome window, which carries the name of the platform", async () => {
  render(<Welcome load={() => Promise.resolve(1234)} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  expect(dialog.open).toBe(true);
  expect(screen.getByRole("heading", { level: 2, name: NAME })).toBeDefined();
  expect(screen.getByText(WELCOME.kind)).toBeDefined();
  expect(screen.getByText(WELCOME.description)).toBeDefined();
  for (const { label, value } of WELCOME.facts) {
    expect(screen.getByText(label).nextElementSibling?.textContent).toBe(value);
  }
  expect(await screen.findByText("1,234")).toBeDefined();
});

test("every member, the signature, the event and every logo is a link", () => {
  render(<Welcome load={() => Promise.resolve(0)} />);
  // The team lead is a member and the developer of the site, so two links carry his name.
  const address = (name: string) => screen.getAllByRole("link", { name })[0]?.getAttribute("href");
  expect(WELCOME.team.map(({ label }) => address(label))).toEqual([
    "https://liaskos.eu/",
    "mailto:simoste2008@gmail.com",
    "mailto:andreasliaskos7@gmail.com",
  ]);
  expect(screen.getAllByRole("link", { name: "Site of Alexandros Liaskos" })).toHaveLength(2);
  expect(address("NASA Space Apps Challenge Hackathon")).toBe(
    "https://www.spaceappschallenge.org/2026/local-events/athens/",
  );
  expect(screen.getByText(/Athens, 14–15 November 2026/)).toBeDefined();
  for (const { name, file, address: site } of WELCOME.logos) {
    const logo = screen.getByRole("img", { name });
    expect(logo.getAttribute("src")).toBe(`/assets/welcome/${file}`);
    expect(logo.closest("a")?.getAttribute("href")).toBe(site);
  }
  // A link that leaves the site opens in another tab and gives the site no way back to this page.
  for (const link of screen.getAllByRole("link")) {
    const leaves = link.getAttribute("href")?.startsWith("https://") ?? false;
    expect(link.getAttribute("target")).toBe(leaves ? "_blank" : null);
    expect(link.getAttribute("rel")).toBe(leaves ? "noreferrer" : null);
  }
});

test("the window says so when the counter of visits gives no answer", async () => {
  render(<Welcome load={() => Promise.reject(new Error("No answer."))} />);
  expect((await screen.findByRole("status")).textContent).toBe("not available");
});

test("the close button closes the window", async () => {
  render(<Welcome load={vi.fn(() => Promise.resolve(1))} />);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: NAME });
  await userEvent.click(screen.getByRole("button", { name: "Close this window" }));
  expect(dialog.open).toBe(false);
});
