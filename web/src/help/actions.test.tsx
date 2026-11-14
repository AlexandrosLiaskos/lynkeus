import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { Ribbon } from "../ribbon/Ribbon";
import { useHelpActions } from "./actions";
import { HelpDialogs } from "./HelpDialogs";
import { aboutDialogStore } from "./state";
import { HELP_TAB } from "./tab";

/** The Help tab as the page holds it: its buttons with their actions, and its dialogs. */
function HelpTab() {
  return (
    <>
      <Ribbon tabs={[HELP_TAB]} actions={useHelpActions()} />
      <HelpDialogs />
    </>
  );
}

beforeEach(() => {
  aboutDialogStore.set(false);
});

test("the button About opens its dialog", async () => {
  render(<HelpTab />);
  await userEvent.click(screen.getByRole("button", { name: "About" }));
  expect(screen.getByRole<HTMLDialogElement>("dialog", { name: "About Lynkeus" }).open).toBe(true);
});

test("the button Methods is not finished and does nothing", async () => {
  render(<HelpTab />);
  const button = screen.getByRole("button", { name: "Methods" });
  expect(button.getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(button);
  expect(screen.queryByRole("dialog")).toBeNull();
});
