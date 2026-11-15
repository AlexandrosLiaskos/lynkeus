// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { openServers } from "../servers/state";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import { Tooltip } from "../shared/tooltip/Tooltip";
import { askSignOut, holdsToken, loadSession, useSession } from "./session";
import { SIGN_IN_PANE } from "./SignInPane";

/**
 * What the menu of the account says about the token, in one sentence for each of the two signed-in states of
 * `docs/Storage.md`.
 */
export const TOKEN_WORDS = {
  held: "The project server holds your token and requests data from NASA in your name.",
  notHeld:
    "The project server does not hold your token now and asks for it when a request to NASA needs it; everything else works without it.",
} as const;

/**
 * The sign-in to Earthdata at the right end of the title bar, where the Sign In menu of ArcGIS Pro stands at the
 * top corner of its window. It shows the picture of an account alone. Its name says whether somebody is signed
 * in and under which user name, and the name shows while the pointer or the keyboard focus rests on the picture.
 * While nobody is signed in, a press opens the pane of the sign-in. While the visitor is signed in, with or
 * without the token, a press opens a small menu with the user name, one sentence on whether the project server
 * holds the token (`TOKEN_WORDS`), and the commands Servers, which opens the list of the servers of the account,
 * and Sign out, which opens the dialog of Sign out. Without the token the menu also offers Give the token, which
 * opens the pane of the sign-in. Nothing is shown before the server has answered.
 */
export function EarthdataAccount() {
  const session = useSession();
  const id = useId();
  const account = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const user = session.state === "signed-in" ? session.user : null;
  const held = holdsToken(session);
  const menuOpen = open && user !== null;

  // A press anywhere outside the menu closes it.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !account.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  if (session.state === "unknown") {
    return null;
  }

  const onPress = () => {
    if (user === null) {
      openToolPane(SIGN_IN_PANE);
      return;
    }
    if (!menuOpen) {
      // The server may have forgotten the sign-in since the page last asked.
      void loadSession();
    }
    setOpen(!menuOpen);
  };

  // The menu closes when the keyboard focus leaves it, and on the Escape key, which returns the focus to the button.
  const onBlur = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && menuOpen) {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  };

  const onServers = () => {
    setOpen(false);
    openServers();
  };

  const onToken = () => {
    setOpen(false);
    openToolPane(SIGN_IN_PANE);
  };

  // The dialog of Sign out returns the keyboard focus to this button when it closes.
  const onSignOut = () => {
    setOpen(false);
    button.current?.focus();
    askSignOut();
  };

  const label = `Earthdata: ${user ?? (session.state === "signed-out" ? "not signed in" : "sign-in not known")}`;

  return (
    <div ref={account} className="account" onBlur={onBlur} onKeyDown={onKeyDown}>
      <Tooltip title={label}>
        {() => (
          <button
            ref={button}
            type="button"
            className="account-button"
            aria-label={label}
            aria-expanded={user === null ? undefined : menuOpen}
            aria-controls={menuOpen ? `${id}-menu` : undefined}
            onClick={onPress}
          >
            <Icon name="account_circle" />
          </button>
        )}
      </Tooltip>
      {menuOpen ? (
        <div className="account-menu" id={`${id}-menu`}>
          <p className="account-menu-text">
            Signed in to Earthdata as {user}
            <span className="account-menu-note">{held ? TOKEN_WORDS.held : TOKEN_WORDS.notHeld}</span>
          </p>
          {held ? null : (
            <button type="button" className="account-menu-command" onClick={onToken}>
              <Icon name="login" />
              Give the token
            </button>
          )}
          <button type="button" className="account-menu-command" onClick={onServers}>
            <Icon name="electrical_services" />
            Servers
          </button>
          <button type="button" className="account-menu-command" onClick={onSignOut}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
