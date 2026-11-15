import { useEffect, useId, useState } from "react";
import { describedBy } from "../shared/field/FieldError";
import { Info } from "../shared/info/Info";
import { Notice } from "../shared/notice/Notice";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import {
  checkStorage,
  clearAll,
  clearPart,
  formatBytes,
  setKeepAll,
  setPartKept,
  storageStore,
  type PartReport,
} from "../shared/storage/storage";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { InfoPane } from "../shared/toolpane/InfoPane";
import { Tooltip } from "../shared/tooltip/Tooltip";

/** The name of the pane Browser storage, which is also the name of the ribbon button that opens it. */
export const STORAGE_PANE = "view-storage";

/**
 * The cookie of the session, as the server sets it: its name is `COOKIE` in `api/src/lynkeus/sessions.py`, and
 * its lifetime is `SESSION_IDLE_TIME` there, which `api/src/lynkeus/routes.py` gives to the cookie again at
 * every opening of the page.
 */
export const SESSION_COOKIE = { name: "lynkeus_session", days: 7 } as const;

/** The sentences of the pane. */
export const STORAGE_TEXTS = {
  info: "The parts of the work that Lynkeus keeps in this browser, so that they return when the page opens again. The stored copies stay in this browser and are not sent to the server.",
  kept: "A checked part is stored after each of its changes and returns when the page opens again. Clearing a part removes its stored copy only, and the work on the page stays as it is.",
  refused:
    "The browser does not store data for this page, so nothing is kept. Allow this site to store data in the settings of the browser.",
  noStorage: "The browser does not store data for this page.",
  off: "Lynkeus keeps nothing of the work in this browser. Check Keep my work in this browser to choose the parts that are kept.",
  nothing: "Nothing stored",
  failed: "Not stored: the browser refused the last copy.",
  noCopy: "Nothing is stored for this part.",
  clearAll: "Removes every stored copy, and the work on the page stays as it is.",
  nothingAtAll: "Nothing is stored.",
  space: "The space of everything that the browser holds for this site, as the browser estimates it.",
  noSpace: "This browser does not report the space of a site and does not offer to keep its data.",
  mayClear: "The browser may clear the data of this site when the disk runs low.",
  keeps: "The browser keeps the data of this site when the disk runs low.",
  agreed: "The browser agreed to keep the data of this site when the disk runs low.",
  declined: "The browser did not agree to keep the data. It may clear them when the disk runs low.",
  notKept: "What the browser and the server keep apart from the parts of this pane.",
  signIn: `The server sets the cookie ${SESSION_COOKIE.name}, which names the session and lasts ${String(SESSION_COOKIE.days)} days from the last opening of the page. The Earthdata user token is never stored in the browser.`,
  cache:
    "The browser may keep the images of the basemaps and the files of the layers in its own cache. The page cannot read or clear that cache, which the settings of the browser clear.",
  session: "The server keeps the jobs and the layers of the session until the session ends.",
} as const;

/** The functions of the browser that report the space of a site. A browser may offer some of them or none. */
type Manager = Partial<Pick<StorageManager, "estimate" | "persist" | "persisted">>;

function manager(): Manager | undefined {
  return (navigator as { storage?: Manager }).storage;
}

/** What the browser reports about the space of the site. */
interface Space {
  /** The bytes that the site uses and the bytes that the browser allows it, or null before the browser answers. */
  estimate: StorageEstimate | null;
  /** Whether the browser keeps the data when the disk runs low, or null before the browser answers. */
  persisted: boolean | null;
  /** The answer of the browser to the request to keep the data, or null before a request. */
  answer: "agreed" | "declined" | null;
  /** Ask the browser to keep the data. */
  ask: () => void;
}

/** Ask the browser for the space of the site, again whenever the size of the stored copies changes. */
function useSpace(stored: number): Space {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [answer, setAnswer] = useState<Space["answer"]>(null);

  useEffect(() => {
    let current = true;
    manager()
      ?.estimate?.()
      .then(
        (next) => {
          if (current) {
            setEstimate(next);
          }
        },
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [stored]);

  useEffect(() => {
    let current = true;
    manager()
      ?.persisted?.()
      .then(
        (next) => {
          if (current) {
            setPersisted(next);
          }
        },
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, []);

  const ask = () => {
    manager()
      ?.persist?.()
      .then(
        (granted) => {
          setPersisted(granted);
          setAnswer(granted ? "agreed" : "declined");
        },
        () => setAnswer("declined"),
      );
  };

  return { estimate, persisted, answer, ask };
}

/** The section Space: the bytes that the site uses and may use, and whether the browser keeps its data. */
function SpaceSection({ stored }: { stored: number }) {
  const { estimate, persisted, answer, ask } = useSpace(stored);
  const offered = manager();
  const estimates = typeof offered?.estimate === "function";
  const persists = typeof offered?.persisted === "function" && typeof offered.persist === "function";

  return (
    <Section title="Space" info={STORAGE_TEXTS.space}>
      {!estimates && !persists ? <Notice kind="info">{STORAGE_TEXTS.noSpace}</Notice> : null}
      {estimates && estimate ? (
        <PropertyList
          groups={[
            {
              rows: [
                {
                  name: "Used by this site",
                  value: estimate.usage === undefined ? "Not reported" : formatBytes(estimate.usage),
                },
                {
                  name: "Allowed by the browser",
                  value: estimate.quota === undefined ? "Not reported" : formatBytes(estimate.quota),
                },
              ],
            },
          ]}
        />
      ) : null}
      {persists && answer === "agreed" ? <Notice kind="success">{STORAGE_TEXTS.agreed}</Notice> : null}
      {persists && answer !== "agreed" && persisted === true ? (
        <Notice kind="info">{STORAGE_TEXTS.keeps}</Notice>
      ) : null}
      {persists && persisted === false ? (
        <Notice
          kind={answer === "declined" ? "warning" : "info"}
          action={{ label: "Ask the browser to keep the data", onClick: ask }}
        >
          {answer === "declined" ? STORAGE_TEXTS.declined : STORAGE_TEXTS.mayClear}
        </Notice>
      ) : null}
    </Section>
  );
}

interface PartRowProps {
  part: PartReport;
  /** Whether anything is kept: the main switch is on and the browser stores data. */
  keeping: boolean;
  /** The id of the notice that says why the switches are inactive, while they are. */
  reason: string | undefined;
  /** Why the copy cannot be cleared while the browser stores nothing, or undefined. */
  refusal: string | undefined;
}

/** A part of the work: its check box, its explanation, the size of its stored copy and the command that clears it. */
function PartRow({ part, keeping, reason, refusal }: PartRowProps) {
  const id = useId();
  const { key, title, description, kept, bytes, failed } = part;
  const name = `${title.charAt(0).toLowerCase()}${title.slice(1)}`;

  return (
    <li className="item storage-part">
      <div className="item-main">
        <div className="usa-checkbox storage-part-title">
          <input
            className="usa-checkbox__input"
            type="checkbox"
            id={id}
            checked={kept}
            aria-disabled={keeping ? undefined : true}
            aria-describedby={describedBy(`${id}-info`, reason ?? null)}
            onChange={(event) => {
              if (keeping) {
                setPartKept(key, event.target.checked);
              }
            }}
          />
          <label className="usa-checkbox__label" htmlFor={id}>
            {title}
          </label>
          <Info id={`${id}-info`} about={title}>
            {description}
          </Info>
        </div>
        <p className="item-line storage-part-size">
          {failed ? STORAGE_TEXTS.failed : bytes === null ? STORAGE_TEXTS.nothing : formatBytes(bytes)}
        </p>
      </div>
      <div className="item-actions">
        <IconButton
          icon="delete"
          label={`Clear the stored ${name}`}
          disabled={bytes === null}
          reason={refusal ?? STORAGE_TEXTS.noCopy}
          onClick={() => clearPart(key)}
        />
      </div>
    </li>
  );
}

/** The content of the pane. It is drawn while the pane is open, and it looks at the storage when it opens. */
function StorageOptions() {
  const id = useId();
  const { keep, refused, parts } = useStore(storageStore);
  useEffect(checkStorage, []);

  const noticeId = `${id}-notice`;
  const reason = refused || !keep ? noticeId : undefined;
  const stored = parts.reduce((total, { bytes }) => total + (bytes ?? 0), 0);
  const empty = parts.every(({ bytes }) => bytes === null);

  return (
    <>
      {refused ? (
        <Notice kind="warning" id={noticeId}>
          {STORAGE_TEXTS.refused}
        </Notice>
      ) : null}
      <Section title="Kept in this browser" count={parts.length} info={STORAGE_TEXTS.kept}>
        <div className="usa-checkbox">
          <input
            className="usa-checkbox__input"
            type="checkbox"
            id={`${id}-keep`}
            checked={keep}
            aria-disabled={refused ? true : undefined}
            aria-describedby={refused ? noticeId : undefined}
            onChange={(event) => {
              if (!refused) {
                setKeepAll(event.target.checked);
              }
            }}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-keep`}>
            Keep my work in this browser
          </label>
        </div>
        {keep || refused ? null : (
          <Notice kind="info" id={noticeId}>
            {STORAGE_TEXTS.off}
          </Notice>
        )}
        <ul className="item-list pane-bleed storage-parts" aria-label="Parts of the work">
          {parts.map((part) => (
            <PartRow
              key={part.key}
              part={part}
              keeping={keep && !refused}
              reason={reason}
              refusal={refused ? STORAGE_TEXTS.noStorage : undefined}
            />
          ))}
        </ul>
        <div className="storage-actions">
          <Tooltip
            title="Clear all"
            text={STORAGE_TEXTS.clearAll}
            note={empty ? STORAGE_TEXTS.nothingAtAll : undefined}
          >
            {(description) => (
              <button
                type="button"
                className="usa-button usa-button--outline"
                aria-disabled={empty ? true : undefined}
                aria-describedby={description}
                onClick={() => {
                  if (!empty) {
                    clearAll();
                  }
                }}
              >
                Clear all
              </button>
            )}
          </Tooltip>
        </div>
      </Section>
      <SpaceSection stored={stored} />
      <Section title="Not kept by Lynkeus" info={STORAGE_TEXTS.notKept}>
        <PropertyList
          groups={[
            {
              rows: [
                { name: "Sign-in", value: STORAGE_TEXTS.signIn },
                { name: "Basemaps and layer files", value: STORAGE_TEXTS.cache },
                { name: "Jobs and layers", value: STORAGE_TEXTS.session },
              ],
            },
          ]}
        />
      </Section>
    </>
  );
}

/**
 * The pane Browser storage of the View tab: the options of what Lynkeus keeps in the local storage of the
 * browser. Its first section holds the main switch and a row for each part of the work, with the size of the
 * stored copy of the part and the command that clears it. The second states the space that the browser reports
 * for the site, and the third what the browser and the server keep apart from these parts. The pane stands in
 * the stack on the right of the map, as a tool pane does, and opens only from its ribbon button.
 */
export function StoragePane() {
  return (
    <InfoPane id={STORAGE_PANE} title="Browser storage" info={STORAGE_TEXTS.info}>
      <StorageOptions />
    </InfoPane>
  );
}
