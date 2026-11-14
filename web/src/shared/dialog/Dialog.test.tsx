import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Dialog } from "./Dialog";

test("a dialog starts closed when its owner has not opened it", () => {
  render(
    <Dialog title="Sign in" open={false} onClose={vi.fn()}>
      Content
    </Dialog>,
  );
  expect(screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).open).toBe(false);
});

test("an open dialog is a modal that carries its title as its name", () => {
  render(
    <Dialog title="Sign in" open onClose={vi.fn()} footer={<button type="button">Continue</button>}>
      Content
    </Dialog>,
  );
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Sign in" });
  expect(dialog.open).toBe(true);
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
});

test("the close button closes the dialog and reports it", async () => {
  const onClose = vi.fn();
  render(
    <Dialog title="Sign in" open onClose={onClose}>
      Content
    </Dialog>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Close this window" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a click on the page around the dialog closes it, and a click inside it does not", async () => {
  const onClose = vi.fn();
  render(
    <Dialog title="Sign in" open onClose={onClose}>
      Content
    </Dialog>,
  );
  await userEvent.click(screen.getByText("Content"));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("dialog"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("the dialog closes when its owner closes it", () => {
  const { rerender } = render(
    <Dialog title="Sign in" open onClose={vi.fn()}>
      Content
    </Dialog>,
  );
  rerender(
    <Dialog title="Sign in" open={false} onClose={vi.fn()}>
      Content
    </Dialog>,
  );
  expect(screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).open).toBe(false);
});
