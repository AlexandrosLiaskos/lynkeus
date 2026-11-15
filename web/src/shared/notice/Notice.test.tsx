import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
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

test("a notice without an action has no button", () => {
  render(<Notice kind="info">The search found 12 products.</Notice>);
  expect(screen.queryByRole("button")).toBeNull();
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
