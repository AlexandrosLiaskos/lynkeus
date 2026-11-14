import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { PANE_WIDTH, panesStore, resetPanes, setPaneOpen } from "../panes";
import { Pane } from "./Pane";

beforeEach(resetPanes);

test("an open pane shows its title and its content", () => {
  render(
    <Pane id="contents" title="Contents">
      Layers
    </Pane>,
  );
  const pane = screen.getByRole("complementary", { name: "Contents" });
  expect(pane.textContent).toContain("Layers");
  expect(pane.style.width).toBe(`${String(PANE_WIDTH.first)}px`);
});

test("a closed pane is not shown", () => {
  setPaneOpen("contents", false);
  render(
    <Pane id="contents" title="Contents">
      Layers
    </Pane>,
  );
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the close button closes the pane", async () => {
  render(
    <Pane id="catalog" title="Catalog">
      Items
    </Pane>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Close the Catalog pane" }));
  expect(panesStore.get().catalog.open).toBe(false);
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the arrow keys on the edge change the width, and the edge states it", async () => {
  render(
    <Pane id="contents" title="Contents">
      Layers
    </Pane>,
  );
  const edge = screen.getByRole("separator", { name: "Width of the Contents pane" });
  expect(edge.getAttribute("aria-valuenow")).toBe(String(PANE_WIDTH.first));
  edge.focus();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  expect(panesStore.get().contents.width).toBe(PANE_WIDTH.first + 2 * PANE_WIDTH.step);
  expect(edge.getAttribute("aria-valuenow")).toBe(String(PANE_WIDTH.first + 2 * PANE_WIDTH.step));
  await userEvent.keyboard("{Home}");
  expect(panesStore.get().contents.width).toBe(PANE_WIDTH.smallest);
});
