// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { openServers } from "../servers/state";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import { Tooltip } from "../shared/tooltip/Tooltip";
import { loadSession, signOutWithMessage, useSession } from "./session";
import { SIGN_IN_PANE } from "./SignInPane";

/**
 * The sign-in to Earthdata at the right end of the title bar, where the Sign In menu of ArcGIS Pro stands at the
 * top corner of its window. It shows the picture of an account alone. Its name says whether somebody is signed
 * in and under which user name, and the name shows while the pointer or the keyboard focus rests on the picture.
 * While nobody is signed in, a press opens the pane of the sign-in. While the visitor is signed in, a press opens
 * a small menu with the user name and the commands Servers, which opens the list of the own servers of the
 * account, and Sign out. Nothing is shown before the server has answered.
 */
export function EarthdataAccount() {
  const session = useSession();
  const id = useId();
  const account = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const user = session.state === "signed-in" ? session.user : null;
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

  const onSignOut = () => {
    setOpen(false);
    button.current?.focus();
    void signOutWithMessage();
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
          <p className="account-menu-text">Signed in to Earthdata as {user}</p>
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
