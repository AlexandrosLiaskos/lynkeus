import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import { loadSession, signOutWithMessage, useSession } from "./session";
import { SIGN_IN_PANE } from "./SignInPane";

/**
 * The sign-in to Earthdata at the right end of the title bar, where the Sign In menu of ArcGIS Pro stands at the
 * top corner of its window. While nobody is signed in it says so, and a press opens the pane of the sign-in.
 * While the visitor is signed in it shows the user name of the account, and a press opens a small menu with the
 * command Sign out. Nothing is shown before the server has answered.
 */
export function EarthdataAccount() {
  const session = useSession();
  const id = useId();
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
      if (!(event.target instanceof Node) || !button.current?.parentElement?.contains(event.target)) {
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

  const onSignOut = () => {
    setOpen(false);
    button.current?.focus();
    void signOutWithMessage();
  };

  return (
    <div className="account" onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="account-button"
        aria-expanded={user === null ? undefined : menuOpen}
        aria-controls={menuOpen ? `${id}-menu` : undefined}
        onClick={onPress}
      >
        <Icon name="account_circle" />
        <span className="account-text">
          Earthdata: {user ?? (session.state === "signed-out" ? "not signed in" : "sign-in not known")}
        </span>
        {user === null ? null : <Icon name={menuOpen ? "expand_less" : "expand_more"} />}
      </button>
      {menuOpen ? (
        <div className="account-menu" id={`${id}-menu`}>
          <p className="account-menu-text">Signed in to Earthdata as {user}</p>
          <button type="button" className="account-menu-command" onClick={onSignOut}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
