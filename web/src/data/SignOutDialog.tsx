// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useState } from "react";
import { forgetKept } from "../contents/kept";
import { Dialog } from "../shared/dialog/Dialog";
import { Info } from "../shared/info/Info";
import { clearAll } from "../shared/storage/storage";
import { useStore } from "../shared/store";
import { accountOf, signOutDialogStore, signOutWithMessage, useSession } from "./session";

/**
 * What the dialog of Sign out says (`docs/Storage.md`, Sign-in states and Further rules of the interface): what
 * stays on the project server, what happens to the map of this browser, and what the choice for a shared
 * computer removes.
 */
export const SIGN_OUT_WORDS = {
  /** What stays on the project server, after the name of the account. */
  server:
    "stay on the project server for this account until the date that each one states. Jobs that were already started go on.",
  /** What happens to the layers of the map of this browser. */
  browser:
    "The layers of the map of this browser are not shown after the sign-out. They return, in their order and with their display, at the next sign-in to this account.",
  /** The label of the choice for a shared computer. */
  clear: "Also remove what this browser keeps",
  /** The explanation of the choice. */
  aboutClear:
    "Choose this on a computer that other people use. Lynkeus then removes every part that it keeps in the local storage of this browser, among them the layers of the map with the name of your account, and loads the page anew, so that nothing of your work stays on it.",
} as const;

interface SignOutDialogProps {
  /** Loads the page anew after the browser storage was cleared. The tests give their own. */
  reload?: () => void;
}

/**
 * The dialog of Sign out. It opens from the button Sign out of the ribbon, of the title bar and of the pane of
 * the sign-in (`askSignOut`), and it says what stays where before anything is sent: the layers, the series and
 * the jobs stay on the project server for the account until their dates, and the map of this browser waits for
 * the next sign-in. A box offers to remove also what this browser keeps, for a shared computer: the stored
 * parts and the layers that the page holds are then removed after the sign-out, and the page is loaded anew.
 * Cancel and the Escape key close the dialog and change nothing. The page holds this component once.
 */
export function SignOutDialog({ reload = () => window.location.reload() }: SignOutDialogProps) {
  const open = useStore(signOutDialogStore);
  const user = accountOf(useSession());
  const id = useId();
  const [clear, setClear] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const close = () => {
    signOutDialogStore.set(false);
    setClear(false);
  };

  const signOut = () => {
    if (leaving) {
      return;
    }
    setLeaving(true);
    void signOutWithMessage().then((signedOut) => {
      setLeaving(false);
      close();
      if (signedOut && clear) {
        // The empty map is stored first, so that another window of this browser empties its map as well.
        forgetKept();
        clearAll();
        reload();
      }
    });
  };

  return (
    <Dialog
      title="Sign out of Earthdata"
      open={open}
      onClose={close}
      footer={
        <ul className="usa-button-group">
          <li className="usa-button-group__item">
            <button type="button" className="usa-button" aria-disabled={leaving ? true : undefined} onClick={signOut}>
              Sign out
            </button>
          </li>
          <li className="usa-button-group__item">
            <button type="button" className="usa-button usa-button--unstyled" onClick={close}>
              Cancel
            </button>
          </li>
        </ul>
      }
    >
      <p>
        The layers, the series and the jobs of {user === null ? "your account" : `the account ${user}`}{" "}
        {SIGN_OUT_WORDS.server}
      </p>
      <p>{SIGN_OUT_WORDS.browser}</p>
      <div className="info-title">
        <div className="usa-checkbox">
          <input
            className="usa-checkbox__input"
            type="checkbox"
            id={`${id}-clear`}
            checked={clear}
            aria-describedby={`${id}-clear-info`}
            onChange={(event) => setClear(event.target.checked)}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-clear`}>
            {SIGN_OUT_WORDS.clear}
          </label>
        </div>
        <Info id={`${id}-clear-info`} about={SIGN_OUT_WORDS.clear}>
          {SIGN_OUT_WORDS.aboutClear}
        </Info>
      </div>
    </Dialog>
  );
}
