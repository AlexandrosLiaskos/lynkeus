// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, useState } from "react";
import { closeToolPane, dockStore } from "../shared/dock/dock";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { FieldTitle, infoId } from "./FieldTitle";
import { loadSession, signIn, signOutWithMessage, useSession } from "./session";

/** The name of the pane: the name of the ribbon button that opens it. */
export const SIGN_IN_PANE = "sign-in";

/** The page of Earthdata Login on which the holder of an account generates and deletes user tokens. */
export const TOKEN_PAGE = "https://urs.earthdata.nasa.gov/user_tokens";

/** The time without use after which the server forgets a sign-in, in minutes (`EARTHDATA_IDLE_TIME` of the server). */
export const IDLE_MINUTES = 30;

/** The longest time for which the server keeps a sign-in, in hours (`EARTHDATA_TIME` of the server). */
export const LONGEST_HOURS = 8;

const LIMITS = `after ${String(IDLE_MINUTES)} minutes without use and after ${String(LONGEST_HOURS)} hours`;

/** The explanations of the pane, one for each title. Each one shows from the button beside its title. */
export const ABOUT = {
  tool: "The sign-in gives the server of Lynkeus a user token of your Earthdata account, with which it requests data from NASA in your name. A user token stands for the account for 60 days.",
  token: `The server of Lynkeus checks the signature and the expiry date of the token and keeps the token in its memory only, to request data from NASA in your name. It forgets the token when you sign out, ${LIMITS}. Lynkeus keeps no copy of the token in the browser.`,
  account:
    "The server of Lynkeus requests data from NASA with the token of this account. A job that was already started goes on after the sign-in ends. To use another account, sign out first.",
} as const;

/** Why the last sign-in did not succeed: an empty field, or the answer of the server. */
interface Fault {
  from: "field" | "server";
  text: string;
}

/**
 * The pane of the button Sign in, with the form of the sign-in to Earthdata. A visitor who is not signed in sees
 * three numbered steps, the field for a user token of Earthdata Login and the button Sign in. A visitor who is
 * signed in sees the user name of the account and the button Sign out, as the Sign In menu of ArcGIS Pro shows
 * the account after a sign-in. Each state of the sign-in is one notice: the check of the session, the account
 * that is signed in, a token that the server refused, and a server that does not answer.
 *
 * The token stays in the field of the browser and in no state of the page: it is read when the form is sent, and
 * the field is emptied before the request leaves.
 *
 * The page holds this component once. It asks the server for the state of the sign-in when the page loads and
 * each time the visitor returns to the page, because the server forgets a sign-in after some time.
 */
export function SignInPane() {
  const session = useSession();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  const [fault, setFault] = useState<Fault | null>(null);
  const [work, setWork] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      if (document.visibilityState === "visible") {
        void loadSession();
      }
    };
    void loadSession();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  const run: ToolPaneRun | null = work === null ? null : { state: "running", text: work };

  const onSignIn = () => {
    const input = field.current;
    if (!input) {
      return;
    }
    const token = input.value.trim();
    input.value = "";
    setShown(false);
    if (token === "") {
      setFault({ from: "field", text: "Paste your user token into this field." });
      input.focus();
      return;
    }
    setFault(null);
    setWork("Checking the token");
    signIn(token).then(
      (user) => {
        setWork(null);
        report("success", `You are signed in to Earthdata as ${user}.`);
        closeToolPane(SIGN_IN_PANE);
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : "The sign-in failed.";
        setWork(null);
        if (dockStore.get().tools.includes(SIGN_IN_PANE)) {
          // The refusal is shown under the field, and the field takes the keyboard focus for the next token.
          setFault({ from: "server", text: message });
          field.current?.focus();
        } else {
          report("error", message);
        }
      },
    );
  };

  const onSignOut = () => {
    setWork("Signing out");
    void signOutWithMessage().then(() => setWork(null));
  };

  const onRead = () => {
    setWork("Asking the server");
    void loadSession().then(() => setWork(null));
  };

  // A refusal and a shown token do not outlast the pane.
  const onClose = () => {
    setFault(null);
    setShown(false);
  };

  if (session.state === "signed-in") {
    return (
      <ToolPane
        id={SIGN_IN_PANE}
        title="Sign in to Earthdata"
        info={ABOUT.account}
        runLabel="Sign out"
        onRun={onSignOut}
        run={run}
      >
        <Notice kind="success">
          You are signed in to Earthdata as {session.user}. The sign-in ends when you sign out, {LIMITS}.
        </Notice>
      </ToolPane>
    );
  }

  if (session.state === "unreachable") {
    return (
      <ToolPane
        id={SIGN_IN_PANE}
        title="Sign in to Earthdata"
        info={ABOUT.tool}
        runLabel="Try again"
        onRun={onRead}
        run={run}
      >
        <Notice kind="error">
          The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata. Check the
          connection and try again.
        </Notice>
      </ToolPane>
    );
  }

  if (session.state === "unknown") {
    return (
      <ToolPane
        id={SIGN_IN_PANE}
        title="Sign in to Earthdata"
        info={ABOUT.tool}
        runLabel="Sign in"
        onRun={onSignIn}
        ready={false}
        missing="Wait for the answer of the server."
      >
        <Notice kind="info">Checking whether you are signed in to Earthdata.</Notice>
      </ToolPane>
    );
  }

  return (
    <ToolPane
      id={SIGN_IN_PANE}
      title="Sign in to Earthdata"
      info={ABOUT.tool}
      runLabel="Sign in"
      onRun={onSignIn}
      run={run}
      onClose={onClose}
    >
      <ol className="sign-in-steps">
        <li>
          Open the page{" "}
          <a href={TOKEN_PAGE} target="_blank" rel="noopener noreferrer">
            Generate Token of Earthdata Login
          </a>{" "}
          (opens in a new tab).
        </li>
        <li>Press Generate Token and then Show Token on that page, and copy the token.</li>
        <li>Paste the token into the field below and press Sign in.</li>
      </ol>
      <FieldTitle field={`${id}-token`} title="User token">
        {ABOUT.token}
      </FieldTitle>
      <input
        ref={field}
        className={fault ? "usa-input usa-input--error" : "usa-input"}
        id={`${id}-token`}
        name="earthdata-token"
        type={shown ? "text" : "password"}
        autoComplete="current-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        required
        readOnly={work !== null}
        aria-invalid={fault ? true : undefined}
        aria-describedby={fault ? `${id}-fault ${infoId(`${id}-token`)}` : infoId(`${id}-token`)}
      />
      <button
        type="button"
        className="usa-show-password sign-in-show"
        aria-controls={`${id}-token`}
        onClick={() => setShown(!shown)}
      >
        {shown ? "Hide token" : "Show token"}
      </button>
      {fault?.from === "field" ? (
        <p className="usa-error-message" id={`${id}-fault`} role="alert">
          {fault.text}
        </p>
      ) : null}
      {fault?.from === "server" ? (
        <Notice kind="error" id={`${id}-fault`}>
          {fault.text}
        </Notice>
      ) : null}
    </ToolPane>
  );
}
