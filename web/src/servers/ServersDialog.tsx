import { useEffect, useId } from "react";
import { useSession, type Session } from "../data/session";
import { SIGN_IN_PANE } from "../data/SignInPane";
import { Dialog } from "../shared/dialog/Dialog";
import { openToolPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { Notice } from "../shared/notice/Notice";
import { serversStore } from "../shared/servers";
import { useStore } from "../shared/store";
import { AddServer } from "./AddServer";
import { connectOf, forgetConnect } from "./connect";
import { focusHeading } from "./focus";
import { followServers, loadServers, serversFaultStore } from "./requests";
import { ServerItem } from "./ServerItem";
import { closeServers, openAddServer, returnStore, serversDialogStore, type ServersDialogState } from "./state";
import { serversSentence } from "./words";

/** What an own server is for, in the words of the empty list. */
export const PURPOSE =
  "An own server is a computer of yours that runs the program Lynkeus Server. Your jobs then run on it and their layers are kept on its disk, so the processors, the memory and the disk of the project server no longer limit them. The computer needs no public address, because the program itself connects to Lynkeus.";

/** Show the list of the servers in the dialog. */
function showList(): void {
  serversDialogStore.set({ open: true, view: "list", code: null });
}

/**
 * The list of the servers of the visitor: for each one its name, whether it is connected and since when it is
 * not, its system, processors and memory, its free and used disk space, its running and waiting jobs and the
 * layers that it keeps. Without a server the list says what an own server is for and offers the button that
 * connects one.
 */
function ServerList() {
  const id = useId();
  const listed = useStore(serversStore);
  const fault = useStore(serversFaultStore);
  const count = listed?.servers.length ?? 0;
  const read = () => void loadServers();
  const add = () => openAddServer();

  // The row of a removed server leaves the dialog, and the focus goes to the heading of the dialog.
  useEffect(focusHeading, [count]);

  const notice =
    fault === null ? null : (
      <Notice kind="error" action={{ label: "Read again", onClick: read }}>
        {fault}
      </Notice>
    );
  if (listed === null) {
    return notice ?? <Notice kind="info">Reading your servers.</Notice>;
  }
  if (listed.servers.length === 0) {
    return (
      <>
        {notice}
        <EmptyState title="No own server" text={PURPOSE} action={{ label: "Add a server", onClick: add }} />
      </>
    );
  }
  const full = listed.servers.length >= listed.limit;
  return (
    <>
      {notice}
      <p className="servers-note" role="status">
        {serversSentence(listed.servers, listed.limit)}
      </p>
      <ul className="item-list servers-list">
        {listed.servers.map((server) => (
          <ServerItem key={server.id} server={server} />
        ))}
      </ul>
      <div className="servers-buttons">
        <button
          type="button"
          className="usa-button"
          aria-disabled={full ? true : undefined}
          aria-describedby={full ? id : undefined}
          onClick={() => {
            if (!full) {
              add();
            }
          }}
        >
          Add a server
        </button>
        {full ? (
          <p className="servers-note" id={id}>
            Your account has the most servers that it may connect. Remove one to connect another.
          </p>
        ) : null}
      </div>
    </>
  );
}

interface SignedOutProps {
  session: Exclude<Session["state"], "signed-in" | "unknown">;
  dialog: ServersDialogState;
}

/**
 * What the dialog shows to a visitor who is not signed in to Earthdata: that the servers belong to an Earthdata
 * account, and the button that leads to the sign-in. The dialog covers the page, so the button closes it and
 * opens the pane of the sign-in; after the sign-in the dialog opens again where it was, with the same code.
 */
function SignedOut({ session, dialog }: SignedOutProps) {
  const toSignIn = () => {
    returnStore.set(dialog);
    closeServers();
    openToolPane(SIGN_IN_PANE);
  };
  const state =
    session === "unreachable"
      ? "The server of Lynkeus did not answer, so it is not known whether you are signed in to Earthdata."
      : "You are not signed in to Earthdata, and an own server belongs to an Earthdata account.";
  const after =
    dialog.view === "add" && dialog.code
      ? `Sign in first: this window then opens again with the code ${dialog.code}.`
      : "Sign in first: this window then opens again.";
  return (
    <>
      <Notice kind="warning" action={{ label: "Sign in", onClick: toSignIn }}>
        {state} {after}
      </Notice>
      <p className="servers-about">{PURPOSE}</p>
    </>
  );
}

/**
 * The dialog of the servers of the visitor: the computers of his own that run his jobs and keep his layers. It
 * lists the servers with their state, and each one is renamed, given its limits and removed there. The command
 * Add a server shows the steps that connect a computer. The servers belong to the Earthdata account, so a
 * visitor who is not signed in is led to the sign-in.
 *
 * The page holds this component once. It keeps the servers up to date (see `followServers`). When the address
 * of the page carries `connect`, as the address that Lynkeus Server opens does, the dialog opens on the steps
 * with the code of the address; the word leaves the address when the pairing ends or the dialog is closed.
 */
export function ServersDialog() {
  const dialog = useStore(serversDialogStore);
  const session = useSession();

  useEffect(() => {
    const code = connectOf(window.location.href);
    if (code !== null) {
      openAddServer(code);
    }
    return followServers();
  }, []);

  const close = () => {
    // A dialog that closes for the sign-in keeps the code in the address, so that a page loaded again finds it.
    if (returnStore.get() === null) {
      forgetConnect();
    }
    closeServers();
  };

  // The button that changed the view has left the dialog, and the focus goes to the heading of the dialog.
  useEffect(focusHeading, [dialog.view]);

  const adding = dialog.view === "add";
  return (
    <Dialog title={adding ? "Add a server" : "Servers"} open={dialog.open} onClose={close} large>
      {dialog.open ? (
        <div className="servers">
          {session.state === "unknown" ? (
            <Notice kind="info">Checking whether you are signed in to Earthdata.</Notice>
          ) : session.state !== "signed-in" ? (
            <SignedOut session={session.state} dialog={dialog} />
          ) : adding ? (
            <>
              <AddServer code={dialog.code} user={session.user} />
              <button type="button" className="usa-button usa-button--unstyled servers-back" onClick={showList}>
                Show my servers
              </button>
            </>
          ) : (
            <ServerList />
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
