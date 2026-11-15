import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { version } from "../../package.json";
import { Header } from "./Header";

test("the title bar holds the name, the version beside it and the account at its end", () => {
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
  render(<Header account={<button type="button">Earthdata: not signed in</button>} />);
  const bar = screen.getByRole("banner");
  const name = screen.getByRole("heading", { level: 1, name: "Lynkeus" });
  const versionButton = screen.getByRole("button", { name: `Version ${version}` });
  const account = screen.getByRole("button", { name: "Earthdata: not signed in" });
  expect(name.parentElement).toBe(bar);
  // The bar is dark, so the mark beside the name is the white one.
  expect(name.querySelector("img")?.getAttribute("src")).toBe("/assets/lynkeus-mark-white.svg");
  expect(name.contains(versionButton)).toBe(false);
  expect(name.compareDocumentPosition(versionButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(versionButton.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(bar.lastElementChild).toBe(account);
  expect(request).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("the title bar without an account holds the name and the version", () => {
  render(<Header />);
  expect(screen.getByRole("heading", { level: 1, name: "Lynkeus" })).toBeDefined();
  expect(screen.getByRole("button", { name: `Version ${version}` }).textContent).toBe(version);
});
