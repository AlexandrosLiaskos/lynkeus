import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { firstSentences, Marked, plain } from "./Marked";

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

test("a text without its marks keeps its words and its addresses", () => {
  expect(plain("The layer `mask` of [the product](https://example.org/p), see <https://example.org/q>.")).toBe(
    "The layer mask of the product, see https://example.org/q.",
  );
  expect(plain("[`GcovWriter.py`, lines 1 to 2](https://example.org/writer)")).toBe("GcovWriter.py, lines 1 to 2");
  expect(plain("No mark.")).toBe("No mark.");
});

test("the first sentences of a text end at a full stop before a capital letter", () => {
  const text = "Near 1, they are alike; near 0, they are not. A low value (Touzi et al., 1999). The third. The fourth.";
  expect(firstSentences(text, 1)).toBe("Near 1, they are alike; near 0, they are not.");
  expect(firstSentences(text, 3)).toBe(
    "Near 1, they are alike; near 0, they are not. A low value (Touzi et al., 1999). The third.",
  );
  expect(firstSentences(text, 9)).toBe(text);
  expect(firstSentences("3 dB is about a factor of two. no capital follows.", 1)).toBe(
    "3 dB is about a factor of two. no capital follows.",
  );
});
