// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useRef, useState } from "react";
import { version } from "../../../package.json";
import { Dialog } from "../../shared/dialog/Dialog";
import { Tooltip } from "../../shared/tooltip/Tooltip";
import { loadLimits, NO_ANSWER, type ServiceLimits } from "./limits";
import {
  ASKING,
  DESCRIPTION,
  limitSentences,
  NOT_SHOWN,
  resourcesSentence,
  serverVersionSentence,
  versionSentence,
} from "./sentences";

/** What the notice knows of the server. */
type Answer =
  /** The server was asked and has not answered yet. */
  | { state: "asked" }
  | { state: "known"; service: ServiceLimits }
  /** `reason` is the sentence of the request that failed. */
  | { state: "unknown"; reason: string };

const ASKED: Answer = { state: "asked" };

/**
 * The version of the page beside the name in the title bar, as a small button. A press opens a notice in the
 * dialog: which version this is and that the application is under development, what Lynkeus may use of its
 * server, each limit that follows with its reason, and where the full description is. The notice asks the server
 * every time it opens, and it is written from that answer. When the server gives no answer the notice says so,
 * and it still shows the version of the page, which is read from `package.json` when the interface is built.
 */
export function VersionNotice() {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<Answer>(ASKED);
  // The number of the last question, so that the answer of an earlier one is not shown.
  const questions = useRef(0);

  const onPress = () => {
    questions.current += 1;
    const question = questions.current;
    setAnswer(ASKED);
    setOpen(true);
    loadLimits().then(
      (service) => {
        if (questions.current === question) {
          setAnswer({ state: "known", service });
        }
      },
      (error: unknown) => {
        if (questions.current === question) {
          setAnswer({ state: "unknown", reason: error instanceof Error ? error.message : NO_ANSWER });
        }
      },
    );
  };

  const otherVersion = answer.state === "known" ? serverVersionSentence(version, answer.service.version) : null;

  return (
    <>
      <Tooltip title="Version of Lynkeus" text="Shows the state of this version and the limits of its server.">
        {(describedBy) => (
          <button
            type="button"
            className="version-button"
            aria-label={`Version ${version}`}
            aria-describedby={describedBy}
            aria-haspopup="dialog"
            onClick={onPress}
          >
            {version}
          </button>
        )}
      </Tooltip>
      <Dialog title={`Version ${version}`} open={open} onClose={() => setOpen(false)}>
        <div className="version-notice">
          <p>{versionSentence(version)}</p>
          <div aria-live="polite" aria-busy={answer.state === "asked"}>
            {answer.state === "asked" ? <p>{ASKING}</p> : null}
            {answer.state === "unknown" ? (
              <p>
                {answer.reason} {NOT_SHOWN}
              </p>
            ) : null}
            {answer.state === "known" ? (
              <>
                {otherVersion === null ? null : <p>{otherVersion}</p>}
                <p>{resourcesSentence(answer.service.resources)}</p>
                <h3>Limits</h3>
                <ul>
                  {limitSentences(answer.service).map((sentence) => (
                    <li key={sentence}>{sentence}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <p>{DESCRIPTION}</p>
        </div>
      </Dialog>
    </>
  );
}
