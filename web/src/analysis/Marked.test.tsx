import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Marked } from "./Marked";

test("a text without marks is shown as it is", () => {
  const { container } = render(<Marked text="Decibel (dB). The result is Float32." />);
  expect(container.textContent).toBe("Decibel (dB). The result is Float32.");
  expect(container.querySelector("code, a")).toBeNull();
});

test("a name between grave accents is written as code", () => {
  const { container } = render(<Marked text="The layer `numberOfLooks` of the product, with `<term>`." />);
  expect(container.textContent).toBe("The layer numberOfLooks of the product, with <term>.");
  expect(Array.from(container.querySelectorAll("code"), (code) => code.textContent)).toEqual([
    "numberOfLooks",
    "<term>",
  ]);
});

test("an address between angle brackets is a link to it, which opens in a new tab", () => {
  render(<Marked text="Change detection. <https://doi.org/10.1109/36.239913>. The article." />);
  const link = screen.getByRole("link", { name: "https://doi.org/10.1109/36.239913" });
  expect(link.getAttribute("href")).toBe("https://doi.org/10.1109/36.239913");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener");
});

test("a link shows its words, also when they are written as code", () => {
  const { container } = render(
    <Marked text="See [cell 56](https://example.org/notebook.ipynb) and [`GcovWriter.py`, lines 1 to 2](https://example.org/writer#L1-L2)." />,
  );
  expect(container.textContent).toBe("See cell 56 and GcovWriter.py, lines 1 to 2.");
  const links = screen.getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["cell 56", "https://example.org/notebook.ipynb"],
    ["GcovWriter.py, lines 1 to 2", "https://example.org/writer#L1-L2"],
  ]);
  expect(links[1]?.querySelector("code")?.textContent).toBe("GcovWriter.py");
});

test("a link to a file of the repository shows its words without a link", () => {
  const { container } = render(<Marked text="The sheet [Backscatter, One date](backscatter-state.md)." />);
  expect(container.textContent).toBe("The sheet Backscatter, One date.");
  expect(screen.queryByRole("link")).toBeNull();
});

test("a formula between grave accents keeps its bars and its angle brackets", () => {
  const { container } = render(
    <Marked text="The mission computes it as `|<s1 * conj(s2)>| / sqrt(<|s1|^2> * <|s2|^2>)`." />,
  );
  expect(container.querySelector("code")?.textContent).toBe("|<s1 * conj(s2)>| / sqrt(<|s1|^2> * <|s2|^2>)");
  expect(container.querySelector("a")).toBeNull();
});
