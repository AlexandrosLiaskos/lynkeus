// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, useState } from "react";
import { closeToolPane, dockStore, openToolPane } from "../shared/dock/dock";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { FieldTitle, infoId } from "./FieldTitle";
import {
  askSignOut,
  cancelSignInRequest,
  holdsToken,
  loadSession,
  signIn,
  signInRequestStore,
  useSession,
} from "./session";

/** The name of the pane: the name of the ribbon button that opens it. */
export const SIGN_IN_PANE = "sign-in";

/** The page of Earthdata Login on which the holder of an account generates and deletes user tokens. */
export const TOKEN_PAGE = "https://urs.earthdata.nasa.gov/user_tokens";

/** The time without use after which the server forgets the token, in minutes (`EARTHDATA_IDLE_TIME` of the server). */
export const IDLE_MINUTES = 30;

/** The longest time for which the server keeps the token, in hours (`EARTHDATA_TIME` of the server). */
export const LONGEST_HOURS = 8;

const LIMITS = `after ${String(IDLE_MINUTES)} minutes without use and after ${String(LONGEST_HOURS)} hours`;

/** The explanations of the pane, one for each title. Each one shows from the button beside its title. */
export const ABOUT = {
  tool: "The sign-in gives the server of Lynkeus a user token of your Earthdata account, with which it requests data from NASA in your name. A user token stands for the account for 60 days.",
  token: `The server of Lynkeus checks the signature and the expiry date of the token and keeps the token in its memory only, to request data from NASA in your name. It forgets the token when you sign out, ${LIMITS}. Lynkeus keeps no copy of the token in the browser.`,
  account:
    "The server of Lynkeus requests data from NASA with the token of this account. A job that was already started goes on after the sign-in ends. To use another account, sign out first.",
} as const;

/**
 * The sentences of the pane about the token (`docs/Storage.md`, Sign-in states). The loss of the token ends no
 * sign-in: the visitor stays signed in to the account, and the token is asked again when a request to NASA needs it.
 */
export const TOKEN_STATE = {
  /** After the name of the account, while the server holds the token. */
  held: `The project server forgets your token when you sign out, ${LIMITS}, and asks for it again when a request to NASA needs it.`,
  /** After the name of the account, while the server does not hold the token. */
  notHeld: "The project server does not hold your token now. Give a user token to request data from NASA.",
  /** After the sentence of the server, while a request waits for the sign-in. */
  continues: "The request continues by itself after the sign-in.",
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
 * A visitor who is signed in while the server does not hold the token sees the account, the same steps and the
 * field, and gives the token again; Sign out is then the secondary command of the pane. When the server refuses
 * a request because it needs the token, the pane opens by itself with the sentence of the server, and after the
 * sign-in the request is sent again. Closing the pane without a sign-in gives the request up.
 *
 * The token stays in the field of the browser and in no state of the page: it is read when the form is sent, and
 * the field is emptied before the request leaves.
 *
 * The page holds this component once. It asks the server for the state of the sign-in when the page loads and
 * each time the visitor returns to the page, to its tab or to its window, because the token and the session end
 * after some time and another window of the browser may have signed out.
 */
export function SignInPane() {
  const session = useSession();
  const request = useStore(signInRequestStore);
  const open = useStore(dockStore).tools.includes(SIGN_IN_PANE);
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
    window.addEventListener("focus", read);
    return () => {
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
    };
  }, []);

  // A request that starts to wait for the sign-in opens the pane and brings it to the front. A pane that closes
  // while the request waits, in whichever way, gives the request up.
  const before = useRef({ waits: false, open: false });
  useEffect(() => {
    const was = before.current;
    before.current = { waits: request !== null, open };
    if (request !== null && !was.waits) {
      openToolPane(SIGN_IN_PANE);
    } else if (request !== null && was.open && !open) {
      cancelSignInRequest();
    }
  }, [request, open]);

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

  const onRead = () => {
    setWork("Asking the server");
    void loadSession().then(() => setWork(null));
  };

  // A refusal and a shown token do not outlast the pane.
  const onClose = () => {
    setFault(null);
    setShown(false);
  };

  const signedIn = session.state === "signed-in";

  if (signedIn && holdsToken(session) && request === null) {
    return (
      <ToolPane
        id={SIGN_IN_PANE}
        title="Sign in to Earthdata"
        info={ABOUT.account}
        runLabel="Sign out"
        onRun={askSignOut}
        run={run}
      >
        <Notice kind="success">
          You are signed in to Earthdata as {session.user}. {TOKEN_STATE.held}
        </Notice>
      </ToolPane>
    );
  }

  if (session.state === "unreachable" && request === null) {
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

  if (session.state === "unknown" && request === null) {
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
      secondary={signedIn ? { label: "Sign out", onClick: askSignOut } : undefined}
      onClose={onClose}
    >
      {request !== null ? (
        <Notice kind="warning">
          {request.sentence} {TOKEN_STATE.continues}
        </Notice>
      ) : signedIn ? (
        <Notice kind="info">
          You are signed in to Earthdata as {session.user}. {TOKEN_STATE.notHeld}
        </Notice>
      ) : null}
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
