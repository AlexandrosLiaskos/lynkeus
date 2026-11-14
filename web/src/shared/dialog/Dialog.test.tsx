import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

test("the first focus goes to the heading, before the fields of the dialog", () => {
  render(
    <Dialog title="Remove the layer" open onClose={vi.fn()}>
      <input aria-label="Name" />
    </Dialog>,
  );
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Remove the layer" }));
});

/** A button that opens a dialog, as a part of the interface declares it. */
function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Remove
      </button>
      <Dialog title="Remove the layer" open={open} onClose={() => setOpen(false)}>
        Content
      </Dialog>
    </>
  );
}

test("a dialog opened from an element that shows the focus line is marked as opened by the keyboard", async () => {
  render(<Opener />);
  screen.getByRole("button", { name: "Remove" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("dialog").dataset.opened).toBe("keyboard");
});

// The simulated browser does not tell a click from a key press, so the answer that a browser gives for a
// button focused by a click is supplied here. The behaviour in a browser is recorded in the research note.
test("a dialog opened from an element that a click has focused is marked as opened by the pointer", async () => {
  render(<Opener />);
  const opener = screen.getByRole("button", { name: "Remove" });
  const matches = opener.matches.bind(opener);
  vi.spyOn(opener, "matches").mockImplementation((selector) => selector !== ":focus-visible" && matches(selector));
  await userEvent.click(opener);
  expect(screen.getByRole("dialog").dataset.opened).toBe("pointer");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Remove the layer" }));
});
