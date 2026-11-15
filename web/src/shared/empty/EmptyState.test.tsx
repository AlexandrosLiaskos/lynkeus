// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { EmptyState } from "./EmptyState";

test("an empty state says what is missing and how to get it, and its button leads to the next step", async () => {
  const search = vi.fn();
  render(
    <EmptyState
      title="No products"
      text="Search NASA's catalogue to list the products of an area."
      action={{ label: "Search products", onClick: search }}
    />,
  );
  expect(screen.getByText("No products")).toBeDefined();
  expect(screen.getByText("Search NASA's catalogue to list the products of an area.")).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Search products" }));
  expect(search).toHaveBeenCalledTimes(1);
});

test("an empty state without a next step has no button, and one without a sentence shows its title alone", () => {
  const { container } = render(<EmptyState title="No layers" />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(container.textContent).toBe("No layers");
});
