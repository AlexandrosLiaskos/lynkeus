import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { closeToolPane, openToolPane, resetDock } from "../dock/dock";
import { InfoPane } from "../toolpane/InfoPane";
import { Notice, type NoticeKind } from "./Notice";

test.each<[NoticeKind, string]>([
  ["info", "status"],
  ["success", "status"],
  ["warning", "status"],
  ["error", "alert"],
])("a notice of the kind %s is announced with the role %s", (kind, role) => {
  const { container } = render(<Notice kind={kind}>The layer was added to the map.</Notice>);
  expect(screen.getByRole(role).textContent).toBe("The layer was added to the map.");
  expect(container.firstElementChild?.classList.contains(`notice--${kind}`)).toBe(true);
  expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("the button of a notice runs its action and stands outside the text that is announced", async () => {
  const signIn = vi.fn();
  render(
    <Notice kind="warning" action={{ label: "Sign in", onClick: signIn }}>
      You are not signed in to Earthdata.
    </Notice>,
  );
  const button = screen.getByRole("button", { name: "Sign in" });
  await userEvent.click(button);
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").contains(button)).toBe(false);
});

test("a notice without an action has no button but its X", () => {
  render(<Notice kind="info">The search found 12 products.</Notice>);
  expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "Close this message",
  ]);
});

test("a field names the text of a notice as its description through the id of the notice", () => {
  render(
    <>
      <input aria-label="User token" aria-describedby="token-fault" />
      <Notice kind="error" id="token-fault" action={{ label: "Try again", onClick: vi.fn() }}>
        Earthdata Login does not accept this token.
      </Notice>
      <Notice kind="info">The search found 12 products.</Notice>
    </>,
  );
  const described = document.getElementById(screen.getByRole("textbox").getAttribute("aria-describedby") ?? "");
  expect(described).toBe(screen.getByRole("alert"));
  expect(described?.textContent).toBe("Earthdata Login does not accept this token.");
  expect(screen.getByRole("status").hasAttribute("id")).toBe(false);
});

test("the X closes the notice, which stays closed until its text changes", async () => {
  function Outline({ name }: { name: string }) {
    return (
      <Notice kind="warning">
        A part of the area lies outside the outline of <strong>{name}</strong>.
      </Notice>
    );
  }
  const { rerender } = render(<Outline name="the product" />);
  const close = screen.getByRole("button", { name: "Close this message" });
  expect(close.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  await userEvent.click(close);
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<Outline name="the product" />);
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<Outline name="the second product" />);
  expect(screen.getByRole("status").textContent).toBe(
    "A part of the area lies outside the outline of the second product.",
  );
  rerender(<Outline name="the product" />);
  expect(screen.getByRole("status").textContent).toBe("A part of the area lies outside the outline of the product.");
});

test("a notice that a field names in aria-describedby belongs to the field and has no X", () => {
  render(
    <>
      <input aria-label="User token" aria-describedby="token-fault" />
      <Notice kind="error" id="token-fault">
        Earthdata Login does not accept this token.
      </Notice>
    </>,
  );
  expect(screen.getByRole("alert").textContent).toBe("Earthdata Login does not accept this token.");
  expect(screen.queryByRole("button")).toBeNull();
});

test("the X gives the keyboard focus to the title of the pane, and the notice returns when the pane opens again", async () => {
  resetDock();
  render(
    <InfoPane id="servers" title="Servers">
      <Notice kind="info">Reading your servers.</Notice>
    </InfoPane>,
  );
  act(() => openToolPane("servers"));
  screen.getByRole("button", { name: "Close this message" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByRole("status")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Servers" }));
  act(() => closeToolPane("servers"));
  act(() => openToolPane("servers"));
  expect(screen.getByRole("status").textContent).toBe("Reading your servers.");
});
