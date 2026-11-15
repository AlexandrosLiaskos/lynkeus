import { useEffect, useId, useState, type SyntheticEvent } from "react";
import { formatMoment } from "../data/jobs";
import { Refusal, wordsOf } from "../data/service";
import { sizeWords } from "../header/notice/numbers";
import { describedBy, FieldError } from "../shared/field/FieldError";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { PropertyList } from "../shared/properties/PropertyList";
import { PAIRING_TIME, serversStore, type PairingView } from "../shared/servers";
import { useStore } from "../shared/store";
import { codeOf, forgetConnect, isUserCode } from "./connect";
import { focusHeading } from "./focus";
import { latestRelease, releasesPage, REPOSITORY, systemOfAgent, SYSTEMS, type Downloads } from "./downloads";
import { confirmPairing, readPairing } from "./requests";
import { serversViewStore, showServerList } from "./state";

const MINUTES = String(PAIRING_TIME / 60);

/** The explanation of the field of the code. It shows from the button beside its title. */
export const ABOUT_CODE = `The eight letters that Lynkeus Server shows on your computer, for example WDJB-MJHT. A code is valid for ${MINUTES} minutes, and the program shows a new one afterwards.`;

/** The sentence for a text that does not have the form of a code. */
export const WRONG_FORM =
  "A code has two groups of four letters, for example WDJB-MJHT. Enter the code that Lynkeus Server shows.";

/** Return the sentence for a code that the project server does not know. */
export function unknownCode(code: string): string {
  return `The code ${code} is unknown or no longer valid. A code is valid for ${MINUTES} minutes: enter the code that Lynkeus Server shows at present.`;
}

/** Return the sentence for an account that has the most servers that it may connect. */
export function tooManyServers(limit: number | null): string {
  const most = limit === null ? "the most servers" : `${String(limit)} servers, the most`;
  return `Your Earthdata account has ${most} that one account may connect. Remove a server in the list of your servers to connect this computer.`;
}

/**
 * The downloads of Lynkeus Server for Windows, macOS and Linux, read from the latest release of the repository
 * on GitHub each time the steps open. The files for the system of the visitor stand first. While no release is
 * published, the list says so in plain words.
 */
export function DownloadList() {
  const [downloads, setDownloads] = useState<Downloads | null>(null);
  const mine = systemOfAgent(navigator.userAgent);

  useEffect(() => {
    let current = true;
    void latestRelease().then((answer) => {
      if (current) {
        setDownloads(answer);
      }
    });
    return () => {
      current = false;
    };
  }, []);

  if (downloads === null) {
    return <Notice kind="info">Asking GitHub for the latest version of Lynkeus Server.</Notice>;
  }
  if (downloads.state === "none") {
    return (
      <Notice kind="info">
        No version of Lynkeus Server is published yet, so there is nothing to download. The downloads appear here with
        the first release.
      </Notice>
    );
  }
  if (downloads.state === "unknown") {
    return (
      <Notice kind="warning">
        The list of the downloads could not be read from GitHub. Open{" "}
        <a href={releasesPage(REPOSITORY)} target="_blank" rel="noopener noreferrer">
          the releases of Lynkeus on GitHub
        </a>{" "}
        (opens in a new tab).
      </Notice>
    );
  }
  const { version, published, downloads: files } = downloads.release;
  if (files.length === 0) {
    return <Notice kind="info">The latest release of Lynkeus, {version}, holds no file of Lynkeus Server.</Notice>;
  }
  const ordered = [...files.filter(({ system }) => system === mine), ...files.filter(({ system }) => system !== mine)];
  return (
    <>
      <ul className="servers-downloads" aria-label="Downloads of Lynkeus Server">
        {ordered.map(({ system, name, address, size }) => (
          <li key={name}>
            <a href={address}>
              {SYSTEMS[system]}: {name}
            </a>{" "}
            ({sizeWords(size)}
            {system === mine ? ", for the system of this computer" : ""})
          </li>
        ))}
      </ul>
      <p className="servers-note">
        Version {version}
        {published === null ? "" : `, published ${formatMoment(published)}`}.
      </p>
    </>
  );
}

/** What the steps know of the pairing of a code. */
type Pairing =
  /** The visitor types a code. `refusal` says why the last code did not lead to a computer. */
  | { state: "typing"; refusal: string | null }
  | { state: "reading"; code: string }
  /** The project server named the computer of the code. `refusal` says why the last Connect did not succeed. */
  | { state: "found"; view: PairingView; connecting: boolean; refusal: string | null };

interface AddServerProps {
  /** The code that the address of the page carried, an empty text for an address without one, or null. */
  code: string | null;
  /** The user name of the Earthdata account that is signed in. */
  user: string;
}

/**
 * The steps that connect a computer of the visitor as a server: download Lynkeus Server, open it, and press
 * Connect here. The program shows a code and opens the site with it. With a code the steps show the code and
 * the computer that asked for the pairing, and the visitor confirms with Connect. Without one they show the
 * three steps, the downloads and a field for the code.
 *
 * An unknown code and an account with the most servers allowed are each stated in one notice. When the
 * project server answers that the visitor is not signed in, the pane shows the sign-in in the place of these
 * steps and keeps the code.
 */
export function AddServer({ code, user }: AddServerProps) {
  const id = useId();
  const limit = useStore(serversStore)?.limit ?? null;
  const first = code === null ? "" : codeOf(code);
  const [typed, setTyped] = useState(first);
  const [fault, setFault] = useState<string | null>(first !== "" && !isUserCode(first) ? WRONG_FORM : null);
  // The code that is asked for, with the number of the question, so that the same code can be asked again.
  const [wanted, setWanted] = useState(isUserCode(first) ? { code: first, turn: 0 } : null);
  const [pairing, setPairing] = useState<Pairing>(
    isUserCode(first) ? { state: "reading", code: first } : { state: "typing", refusal: null },
  );

  useEffect(() => {
    if (wanted === null) {
      return;
    }
    let current = true;
    readPairing(wanted.code).then(
      (view) => {
        if (current) {
          setPairing({ state: "found", view, connecting: false, refusal: null });
        }
      },
      (error: unknown) => {
        if (current) {
          const refusal =
            error instanceof Refusal && error.status === 404
              ? unknownCode(wanted.code)
              : wordsOf(error, "The code could not be checked.");
          setTyped(wanted.code);
          setPairing({ state: "typing", refusal });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [wanted]);

  // The button of a step leaves the pane with its step, and the focus goes to the title of the pane.
  useEffect(focusHeading, [pairing.state]);

  const find = (event: SyntheticEvent) => {
    event.preventDefault();
    const next = codeOf(typed);
    setTyped(next);
    if (!isUserCode(next)) {
      setFault(WRONG_FORM);
      return;
    }
    setFault(null);
    // The pane keeps the code, so that it is still there after a sign-in.
    serversViewStore.set({ ...serversViewStore.get(), code: next });
    setPairing({ state: "reading", code: next });
    setWanted({ code: next, turn: (wanted?.turn ?? 0) + 1 });
  };

  const another = () => {
    setTyped("");
    setFault(null);
    setWanted(null);
    setPairing({ state: "typing", refusal: null });
  };

  if (pairing.state === "reading") {
    return <Notice kind="info">Asking which computer shows the code {pairing.code}.</Notice>;
  }

  if (pairing.state === "found") {
    const { view, connecting, refusal } = pairing;
    const connect = () => {
      if (connecting) {
        return;
      }
      setPairing({ state: "found", view, connecting: true, refusal: null });
      confirmPairing(view.user_code).then(
        (server) => {
          report("success", `The computer "${server.name}" is connected as a server of your Earthdata account.`);
          forgetConnect();
          showServerList();
        },
        (error: unknown) => {
          if (error instanceof Refusal && error.status === 404) {
            setTyped(view.user_code);
            setPairing({ state: "typing", refusal: unknownCode(view.user_code) });
            return;
          }
          const words =
            error instanceof Refusal && error.status === 409
              ? tooManyServers(limit)
              : wordsOf(error, "The server could not be connected.");
          setPairing({ state: "found", view, connecting: false, refusal: words });
        },
      );
    };
    return (
      <>
        <PropertyList
          groups={[
            {
              title: "Computer that asks to be connected",
              rows: [
                { name: "Code", value: view.user_code },
                { name: "Name of the computer", value: view.machine.name },
                { name: "System", value: view.machine.system },
                { name: "Lynkeus Server", value: `Version ${view.machine.version}` },
              ],
            },
          ]}
        />
        <Notice kind="info">
          Press Connect only when Lynkeus Server on your computer shows the code {view.user_code}. The computer then
          runs jobs and keeps layers for the Earthdata account {user}.
        </Notice>
        {refusal ? <Notice kind="error">{refusal}</Notice> : null}
        <div className="servers-buttons">
          <button type="button" className="usa-button" aria-disabled={connecting ? true : undefined} onClick={connect}>
            {connecting ? "Connecting" : "Connect"}
          </button>
          <button type="button" className="usa-button usa-button--unstyled" onClick={another}>
            Enter another code
          </button>
        </div>
      </>
    );
  }

  const field = `${id}-code`;
  const { refusal } = pairing;
  return (
    <form className="usa-form" onSubmit={find} noValidate>
      <ol className="servers-steps">
        <li>
          Download Lynkeus Server for the system of your computer.
          <DownloadList />
        </li>
        <li>Open Lynkeus Server on that computer. The program shows a code of eight letters and opens this page.</li>
        <li>Check that the code here is the one that the program shows, and press Connect here.</li>
      </ol>
      <FieldTitle field={field} title="Code">
        {ABOUT_CODE}
      </FieldTitle>
      <input
        className={fault ? "usa-input usa-input--error servers-code" : "usa-input servers-code"}
        id={field}
        value={typed}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={fault ? true : undefined}
        aria-describedby={describedBy(infoId(field), fault && `${field}-fault`, refusal && `${field}-refusal`)}
        onChange={(event) => setTyped(event.target.value)}
      />
      <FieldError id={`${field}-fault`}>{fault}</FieldError>
      {refusal ? (
        <Notice kind="error" id={`${field}-refusal`}>
          {refusal}
        </Notice>
      ) : null}
      <div className="servers-buttons">
        <button type="submit" className="usa-button">
          Find the computer
        </button>
      </div>
    </form>
  );
}
