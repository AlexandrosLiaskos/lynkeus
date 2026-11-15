// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useState, type ReactNode } from "react";
import { extendAll, keptAllWords } from "../catalog/keeping";
import { layersOpenStore } from "../catalog/state";
import { jobsStore, loadJobs } from "../data/jobs";
import { layersStore, loadLayers } from "../data/layers";
import { loadSeries, seriesStore } from "../data/series";
import { wordsOf } from "../data/service";
import { signOutWithMessage, useSession, type Session } from "../data/session";
import { SIGN_IN_PANE } from "../data/SignInPane";
import { limitsStore, readLimits, type ServiceLimits } from "../header/notice/limits";
import { amount, countWords, sizeWords, timeWords } from "../header/notice/numbers";
import { freeSpaceSentence, tokenTimeWords } from "../header/notice/sentences";
import { loadServers } from "../servers/requests";
import { openServers } from "../servers/state";
import { connectionWords } from "../servers/words";
import { Dialog } from "../shared/dialog/Dialog";
import { openToolPane, showPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { describedBy } from "../shared/field/FieldError";
import { Info } from "../shared/info/Info";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { PropertyList, type Property, type PropertyGroup } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { serversStore, type Server } from "../shared/servers";
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
import { removeEverything } from "./account";
import { Bar } from "./Bar";
import { KEPT, statementOf } from "./kept";
import {
  accountLimits,
  countLine,
  everythingWords,
  filesSize,
  folderInfo,
  folderOf,
  isUnfinished,
  jobsLine,
  jobsUntilWords,
  nextRemoval,
  nextRemovalWords,
  ofMost,
  projectJobs,
  projectLayers,
  sizeLine,
} from "./words";

/** The name of the pane Storage, which is also the name of the ribbon button that opens it. */
export const STORAGE_PANE = "options-storage";

/** The name of the cookie of the session, as the server sets it: `COOKIE` in `api/src/lynkeus/sessions.py`. */
export const SESSION_COOKIE = "lynkeus_session";

/**
 * The sentences of the pane. The statements of what is kept are those of `docs/Storage.md` (`kept.ts`); the
 * sentences here say what the pane itself shows and does. No sentence types a duration or a limit: the rows
 * read them from the limits of the server.
 */
export const STORAGE_TEXTS = {
  info: "Everything that Lynkeus keeps for you: in this browser, on the project server, on your servers and at NASA. Each row states what is kept, its size where it has one, until when it is kept and the command that removes it.",
  kept: "A checked part is stored after each of its changes and returns when the page opens again. A stored copy stays until you clear it or uncheck its part. Clearing a part removes its stored copy only, and the work on the page stays as it is.",
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
  cookieSet: `Set, under the name ${SESSION_COOKIE}`,
  cookieNotSet: "Not set: you are not signed in to Earthdata",
  cookieUnknown: "Not known: the server of Lynkeus did not answer",
  cache:
    "The browser may keep the images of the basemaps and the files of the layers in its own cache. The page cannot read or clear that cache, which the settings of the browser clear.",
  cacheSize: "The browser does not report its size to the page",
  cacheUntil: "Until the browser clears it, or you clear it in the settings of the browser",
  checking: "Checking whether you are signed in to Earthdata.",
  unreachable: "The server of Lynkeus did not answer, so what the project server keeps for you cannot be shown.",
  signedOut: "You are not signed in to Earthdata, so the project server keeps no layer, series or job for you.",
  untilDate: "Each one until the date that it states in the Catalog pane",
  keepAllNothing: "The project server keeps no layer and no series of your account.",
  removeEverything:
    "Removes the layers, the series and the jobs of your account from the project server, after a confirmation.",
  removeNothing: "The project server keeps nothing of your account.",
  removed: "Everything of your account was removed from the project server.",
  tokenHeld: "Held in the memory of the web service",
  tokenNotHeld: "Not held: it is asked again when a request to NASA needs it",
  log: "Written for every visitor, signed in or not",
  logUntil: "Until newer lines take the place of the oldest ones. No command of the page removes it",
  purpose:
    "A server of yours is a computer of your own that runs your jobs with the program Lynkeus Server and keeps their layers on its disk until you remove them.",
  readingServers: "Reading your servers.",
  notReported: "Not known before the first report of the server",
  noSystem: "Not known: the server did not name its system",
  untilRemoved: "Until you remove them in the Catalog pane",
  services: "The services outside Lynkeus that receive a request while you work, and what each one receives.",
  github:
    "GitHub receives the request of your browser for the latest version of Lynkeus Server when the pane Servers offers the program.",
} as const;

/** State for how long the command Keep all keeps the layers and the series, with the keeping time of the limits. */
export function keepAllWords(limits: ServiceLimits | null): string {
  const time = limits === null ? "the keeping time" : timeWords(limits.limits.keep_time);
  return `Keeps every layer and series of your account on the project server for ${time} from now.`;
}

/** State until when the cookie of the session lasts, with the keeping time of the limits. */
export function cookieUntilWords(limits: ServiceLimits | null): string {
  const time = limits === null ? "the keeping time" : timeWords(limits.limits.keep_time);
  return `Until ${time} without use, or until you sign out`;
}

/** State for how long the web service holds the token, with the times of the limits. */
export function tokenUntilWords(limits: ServiceLimits | null): string {
  return limits === null
    ? "For a limited time, or until you sign out"
    : `For ${tokenTimeWords(limits.limits)}, or until you sign out`;
}

/**
 * Tell whether the web service holds the Earthdata user token, as the answer about the session says it
 * (`token` of `GET /api/session` in `docs/Storage.md`), or null where the state of the sign-in does not say it.
 */
export function tokenHeld(session: Session): boolean | null {
  const held: unknown = "token" in session ? session.token : undefined;
  return session.state === "signed-in" && typeof held === "boolean" ? held : null;
}

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

interface KeptItemProps {
  /** What is kept. */
  title: string;
  /** The statement about it, behind the "i" beside the title. */
  info?: string;
  /** At most two lines: the size or the state, and until when it is kept. */
  lines: readonly string[];
  /** The command that removes it, at the right end of the row. */
  action?: ReactNode;
  /** A bar under the lines. */
  children?: ReactNode;
}

/** One row of what is kept: what it is, its size or its state, until when it is kept and the command that removes it. */
function KeptItem({ title, info, lines, action, children }: KeptItemProps) {
  const id = useId();
  return (
    <li className="item storage-row">
      <div className="item-main">
        <div className="storage-row-title">
          <span className="item-title">{title}</span>
          {info ? (
            <Info id={`${id}-info`} about={title}>
              {info}
            </Info>
          ) : null}
        </div>
        {lines.map((line) => (
          <p className="item-line" key={line}>
            {line}
          </p>
        ))}
        {children}
      </div>
      {action ? <div className="item-actions">{action}</div> : null}
    </li>
  );
}

/** The command Sign out of a row: it forgets the token, ends the session and removes the cookie. */
function SignOut() {
  return (
    <button type="button" className="usa-button usa-button--unstyled" onClick={() => void signOutWithMessage()}>
      Sign out
    </button>
  );
}

/** The space that the browser reports for the site, and whether the browser keeps its data. */
function SpaceRows({ stored }: { stored: number }) {
  const { estimate, persisted, answer, ask } = useSpace(stored);
  const offered = manager();
  const estimates = typeof offered?.estimate === "function";
  const persists = typeof offered?.persisted === "function" && typeof offered.persist === "function";

  return (
    <div className="storage-space">
      {!estimates && !persists ? <Notice kind="info">{STORAGE_TEXTS.noSpace}</Notice> : null}
      {estimates && estimate ? (
        <PropertyList
          groups={[
            {
              title: "Space of this site",
              rows: [
                {
                  name: "Used by this site",
                  value: estimate.usage === undefined ? "Not reported" : formatBytes(estimate.usage),
                  info: STORAGE_TEXTS.space,
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
    </div>
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

interface SectionProps {
  session: Session;
  limits: ServiceLimits | null;
}

/**
 * The section This browser: the main switch and a row for each part of the work that the page keeps in the
 * local storage of the browser, with the size of its stored copy and the command that clears it; the space that
 * the browser reports for the site; the cookie of the session, which the browser holds and the page cannot
 * read; and the cache of the browser.
 */
function BrowserSection({ session, limits }: SectionProps) {
  const id = useId();
  const { keep, refused, parts } = useStore(storageStore);
  useEffect(checkStorage, []);

  const noticeId = `${id}-notice`;
  const reason = refused || !keep ? noticeId : undefined;
  const stored = parts.reduce((total, { bytes }) => total + (bytes ?? 0), 0);
  const empty = parts.every(({ bytes }) => bytes === null);
  const signedIn = session.state === "signed-in";

  return (
    <Section title="This browser" info={statementOf("browser")}>
      {refused ? (
        <Notice kind="warning" id={noticeId}>
          {STORAGE_TEXTS.refused}
        </Notice>
      ) : null}
      <div className="usa-checkbox storage-part-title">
        <input
          className="usa-checkbox__input"
          type="checkbox"
          id={`${id}-keep`}
          checked={keep}
          aria-disabled={refused ? true : undefined}
          aria-describedby={describedBy(`${id}-keep-info`, refused ? noticeId : null)}
          onChange={(event) => {
            if (!refused) {
              setKeepAll(event.target.checked);
            }
          }}
        />
        <label className="usa-checkbox__label" htmlFor={`${id}-keep`}>
          Keep my work in this browser
        </label>
        <Info id={`${id}-keep-info`} about="Keep my work in this browser">
          {STORAGE_TEXTS.kept}
        </Info>
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
        <Tooltip title="Clear all" text={STORAGE_TEXTS.clearAll} note={empty ? STORAGE_TEXTS.nothingAtAll : undefined}>
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
      <SpaceRows stored={stored} />
      <ul className="item-list pane-bleed storage-rows" aria-label="Kept by the browser itself">
        <KeptItem
          title="Cookie of the session"
          info={statementOf("cookie")}
          lines={
            signedIn
              ? [STORAGE_TEXTS.cookieSet, cookieUntilWords(limits)]
              : [session.state === "signed-out" ? STORAGE_TEXTS.cookieNotSet : STORAGE_TEXTS.cookieUnknown]
          }
          action={signedIn ? <SignOut /> : undefined}
        />
        <KeptItem
          title="Cache of the browser"
          info={STORAGE_TEXTS.cache}
          lines={[STORAGE_TEXTS.cacheSize, STORAGE_TEXTS.cacheUntil]}
        />
      </ul>
    </Section>
  );
}

/** The log of the web server: it is written for every visitor, so the row shows whatever the sign-in is. */
function LogRow() {
  return (
    <KeptItem title="Log of requests" info={statementOf("log")} lines={[STORAGE_TEXTS.log, STORAGE_TEXTS.logUntil]} />
  );
}

/**
 * What the project server keeps for the account that is signed in: the layers, the series and the size of the
 * files beside the limits of the account, each as numbers and as a bar; the records of the jobs; the next
 * removal; the command that keeps everything for the keeping time from now, and the command that removes
 * everything, which asks first and names what goes and what stays; and the Earthdata user token with its times.
 */
function AccountRows({ user, session, limits }: SectionProps & { user: string }) {
  const layers = projectLayers(useStore(layersStore));
  const series = useStore(seriesStore);
  const jobs = projectJobs(useStore(jobsStore));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<"keep" | "remove" | null>(null);

  const most = accountLimits(limits?.limits ?? null);
  const size = filesSize(layers);
  const nothingDated = layers.length + series.length === 0;
  const nothing = nothingDated && jobs.length === 0;
  const held = tokenHeld(session);

  const keepAll = () => {
    if (nothingDated || busy !== null) {
      return;
    }
    setBusy("keep");
    extendAll()
      .then(() => report("info", keptAllWords(limits)))
      .catch((error: unknown) => report("error", wordsOf(error, "The layers and the series could not be kept longer.")))
      .finally(() => setBusy(null));
  };

  const remove = () => {
    if (busy !== null) {
      return;
    }
    setBusy("remove");
    removeEverything()
      .then(() => report("info", STORAGE_TEXTS.removed))
      .catch((error: unknown) => report("error", wordsOf(error, "Your layers, series and jobs could not be removed.")))
      .finally(() => {
        setBusy(null);
        setAsking(false);
      });
  };

  const showCatalog = () => {
    layersOpenStore.set(true);
    showPane("catalog");
  };

  const layersWords = countLine(layers.length, most.layers);
  const seriesWords = countLine(series.length, most.series);
  const filesWords = sizeLine(size, most.size);
  const everything = everythingWords({
    unfinished: jobs.filter(isUnfinished).length,
    layers: layers.length,
    series: series.length,
  });

  return (
    <>
      <PropertyList
        groups={[
          {
            rows: [
              { name: "Earthdata account", value: user },
              { name: "Next removal", value: nextRemovalWords(nextRemoval(layers, series)) },
            ],
          },
        ]}
      />
      <ul className="item-list pane-bleed storage-rows" aria-label="Kept on the project server">
        <KeptItem title="Layers" lines={[layersWords, STORAGE_TEXTS.untilDate]}>
          {most.layers === null ? null : (
            <Bar label="Layers of the account" value={layers.length} most={most.layers} words={layersWords} />
          )}
        </KeptItem>
        <KeptItem title="Files of the layers" lines={[filesWords]}>
          {most.size === null ? null : (
            <Bar label="Size of the files of the layers" value={size.bytes} most={most.size} words={filesWords} />
          )}
        </KeptItem>
        <KeptItem title="Series" lines={[seriesWords, STORAGE_TEXTS.untilDate]}>
          {most.series === null ? null : (
            <Bar label="Series of the account" value={series.length} most={most.series} words={seriesWords} />
          )}
        </KeptItem>
        <KeptItem title="Jobs" lines={[jobsLine(jobs, most.unfinished), jobsUntilWords(most.keep)]} />
      </ul>
      <div className="storage-actions">
        <Tooltip
          title="Keep all"
          text={keepAllWords(limits)}
          note={nothingDated ? STORAGE_TEXTS.keepAllNothing : undefined}
        >
          {(description) => (
            <button
              type="button"
              className="usa-button usa-button--outline"
              aria-disabled={nothingDated || busy !== null ? true : undefined}
              aria-describedby={description}
              onClick={keepAll}
            >
              Keep all
            </button>
          )}
        </Tooltip>
        <Tooltip
          title="Remove everything of mine"
          text={STORAGE_TEXTS.removeEverything}
          note={nothing ? STORAGE_TEXTS.removeNothing : undefined}
        >
          {(description) => (
            <button
              type="button"
              className="usa-button usa-button--outline"
              aria-disabled={nothing || busy !== null ? true : undefined}
              aria-describedby={description}
              onClick={() => {
                if (!nothing && busy === null) {
                  setAsking(true);
                }
              }}
            >
              Remove everything of mine
            </button>
          )}
        </Tooltip>
        <button type="button" className="usa-button usa-button--unstyled" onClick={showCatalog}>
          Show in the Catalog pane
        </button>
      </div>
      <ul className="item-list pane-bleed storage-rows" aria-label="Kept by the web service and the web server">
        <KeptItem
          title="Earthdata user token"
          info={statementOf("token")}
          lines={[
            ...(held === null ? [] : [held ? STORAGE_TEXTS.tokenHeld : STORAGE_TEXTS.tokenNotHeld]),
            tokenUntilWords(limits),
          ]}
          action={<SignOut />}
        />
        <LogRow />
      </ul>
      <Dialog
        title="Remove everything of mine from the project server"
        open={asking}
        onClose={() => setAsking(false)}
        footer={
          <ul className="usa-button-group">
            <li className="usa-button-group__item">
              <button
                type="button"
                className="usa-button usa-button--secondary"
                aria-disabled={busy !== null ? true : undefined}
                onClick={remove}
              >
                Remove everything
              </button>
            </li>
            <li className="usa-button-group__item">
              <button type="button" className="usa-button usa-button--unstyled" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </li>
          </ul>
        }
      >
        {everything.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </Dialog>
    </>
  );
}

/**
 * The section Project server. Signed in, it shows what the project server keeps for the account. Not signed
 * in, it says that the project server keeps no layer, series or job for the visitor and leads to the sign-in.
 * The log of the web server is written for every visitor, so its row always shows.
 */
function ProjectSection({ session, limits }: SectionProps) {
  const toSignIn = () => openToolPane(SIGN_IN_PANE);
  return (
    <Section title="Project server" info={`${statementOf("projectServer")} ${statementOf("files")}`}>
      {limits === null ? null : <p className="storage-note">{freeSpaceSentence(limits)}</p>}
      {session.state === "signed-in" ? (
        <AccountRows user={session.user} session={session} limits={limits} />
      ) : (
        <>
          {session.state === "unknown" ? <Notice kind="info">{STORAGE_TEXTS.checking}</Notice> : null}
          {session.state === "unreachable" ? <Notice kind="warning">{STORAGE_TEXTS.unreachable}</Notice> : null}
          {session.state === "signed-out" ? (
            <EmptyState
              title="Nothing kept for you"
              text={STORAGE_TEXTS.signedOut}
              action={{ label: "Sign in", onClick: toSignIn }}
            />
          ) : null}
          <ul className="item-list pane-bleed storage-rows" aria-label="Kept by the web server">
            <LogRow />
          </ul>
        </>
      )}
    </Section>
  );
}

/** Return what the pane shows of one server of the visitor: its connection, its layers, its space and its folder. */
export function serverRows(server: Server): Property[] {
  const { state } = server;
  const connection: Property = { name: "Connection", value: connectionWords(server) };
  if (state === null) {
    return [connection, { name: "Layers and space", value: STORAGE_TEXTS.notReported }];
  }
  const space = ofMost(sizeWords(state.disk_used), sizeWords(state.limits.storage));
  const folder = folderOf(state.system);
  return [
    connection,
    { name: "Layers kept", value: countWords(state.layers) },
    {
      name: "Space used by layers",
      value: (
        <>
          {space}
          <Bar
            label={`Space used by the layers of ${server.name}`}
            value={state.disk_used}
            most={state.limits.storage}
            words={space}
          />
        </>
      ),
    },
    { name: "Free disk space", value: sizeWords(state.disk_free) },
    { name: "Kept until", value: STORAGE_TEXTS.untilRemoved },
    folder === null
      ? { name: "Folder of Lynkeus Server", value: STORAGE_TEXTS.noSystem, info: folderInfo(null) }
      : { name: "Folder of Lynkeus Server", value: folder.folder, copy: true, info: folderInfo(folder.system) },
  ];
}

/**
 * The section Your servers: each server of the account with its layers, its space and the folder of Lynkeus
 * Server on that computer, from the list of servers that the pane Servers also shows. Without a server, one
 * sentence says what a server is for, and a button leads to the pane Servers.
 */
function ServersSection({ session }: { session: Session }) {
  const listed = useStore(serversStore);
  const servers = listed?.servers ?? [];
  const signedIn = session.state === "signed-in";
  const groups: PropertyGroup[] = servers.map((server) => ({
    id: server.id,
    title: server.name,
    rows: serverRows(server),
  }));
  const open = { label: "Open Servers", onClick: openServers };
  return (
    <Section title="Your servers" count={listed === null ? undefined : servers.length} info={statementOf("computer")}>
      {signedIn && listed === null ? <Notice kind="info">{STORAGE_TEXTS.readingServers}</Notice> : null}
      {!signedIn || (listed !== null && servers.length === 0) ? (
        <EmptyState title="No server connected" text={STORAGE_TEXTS.purpose} action={open} />
      ) : null}
      {signedIn && groups.length > 0 ? (
        <>
          <p className="storage-note">
            {amount(servers.length, "server of yours keeps", "servers of yours keep")} the layers of the jobs that ran
            there.
          </p>
          <PropertyList groups={groups} />
          <div className="storage-actions">
            <button type="button" className="usa-button usa-button--unstyled" onClick={openServers}>
              Open Servers
            </button>
          </div>
        </>
      ) : null}
    </Section>
  );
}

/** The section NASA and other services: what each service outside Lynkeus receives. */
function ServicesSection() {
  const [harmony, catalogue, basemaps] = KEPT.nasa;
  return (
    <Section title="NASA and other services" info={STORAGE_TEXTS.services}>
      <PropertyList
        groups={[
          {
            rows: [
              { name: "NASA Harmony", value: harmony },
              { name: "NASA's catalogue", value: catalogue },
              { name: "Basemaps", value: basemaps },
              { name: "GitHub", value: STORAGE_TEXTS.github },
            ],
          },
        ]}
      />
    </Section>
  );
}

/**
 * The content of the pane. It is drawn while the pane is open. When it opens, and when the visitor signs in,
 * it reads the limits of the server and the lists of what the account keeps, so that the rows state the
 * present.
 */
function StorageSections() {
  const session = useSession();
  const limits = useStore(limitsStore);
  const signedIn = session.state === "signed-in";

  useEffect(() => {
    void readLimits();
  }, []);

  useEffect(() => {
    if (signedIn) {
      void loadLayers();
      void loadSeries();
      void loadJobs();
      void loadServers();
    }
  }, [signedIn]);

  return (
    <div className="storage">
      <BrowserSection session={session} limits={limits} />
      <ProjectSection session={session} limits={limits} />
      <ServersSection session={session} />
      <ServicesSection />
    </div>
  );
}

/**
 * The pane Storage of the Options tab (`docs/Storage.md`, "Pane Storage"): everything that Lynkeus keeps for
 * the visitor, in four sections. This browser holds the parts of the work with their switches, the cookie of
 * the session and the cache. Project server holds what the account keeps there beside its limits, and the
 * commands that keep and remove all of it. Your servers lists the servers of the account. NASA and other
 * services says what each service outside Lynkeus receives. The pane stands in the stack on the right of the
 * map, as a tool pane does, and opens only from its ribbon button.
 */
export function StoragePane() {
  return (
    <InfoPane id={STORAGE_PANE} title="Storage" info={STORAGE_TEXTS.info}>
      <StorageSections />
    </InfoPane>
  );
}
