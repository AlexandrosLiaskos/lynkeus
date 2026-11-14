import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Messages, MESSAGE_TIME } from "./Messages";
import { messagesStore, report } from "./messages";

beforeEach(() => {
  messagesStore.set([]);
});

afterEach(() => {
  vi.useRealTimers();
});

test("a reported message is shown with its text", () => {
  render(<Messages />);
  act(() => report("success", "The layer was received."));
  expect(screen.getByRole("status").textContent).toBe("The layer was received.");
});

test("an error is announced as an alert", () => {
  render(<Messages />);
  act(() => report("error", "The request failed."));
  expect(screen.getByRole("alert").textContent).toBe("The request failed.");
});

test("the close button removes its message and leaves the others", async () => {
  render(<Messages />);
  act(() => {
    report("error", "First");
    report("error", "Second");
  });
  const [first] = screen.getAllByRole("button", { name: "Close this message" });
  await userEvent.click(first as HTMLElement);
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(["Second"]);
});

test("a message of success leaves by itself, and an error stays", () => {
  vi.useFakeTimers();
  render(<Messages />);
  act(() => {
    report("success", "Finished");
    report("error", "Failed");
  });
  act(() => {
    vi.advanceTimersByTime(MESSAGE_TIME);
  });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe("Failed");
});
