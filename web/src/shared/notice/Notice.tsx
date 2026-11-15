// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { Children, isValidElement, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "../icon/Icon";

/** The kinds of notice, as in the alert of the U.S. Web Design System. */
export type NoticeKind = "info" | "success" | "warning" | "error";

interface NoticeProps {
  kind: NoticeKind;
  /**
   * The id of the element that holds the text. A field that the notice is about carries it in `aria-describedby`,
   * so that a screen reader reads the notice with the field. Such a notice belongs to its field, as the error of a
   * field does, and has no X.
   */
  id?: string;
  /** The button of the notice, when the user can do something about what it states. */
  action?: { label: string; onClick: () => void };
  /** What happened and what to do next, in at most two sentences. */
  children: ReactNode;
}

const ICONS = { info: "info", success: "check_circle", warning: "warning", error: "error" } as const;

/** Return the words of a text, with the words of the elements inside it. */
function wordsOf(text: ReactNode): string {
  return Children.toArray(text)
    .map((part) => {
      if (typeof part === "string" || typeof part === "number") {
        return String(part);
      }
      return isValidElement<{ children?: ReactNode }>(part) ? wordsOf(part.props.children) : "";
    })
    .join("");
}

interface CloseButtonProps {
  /** Called when the button is pressed, with the click, which tells whether the button had the keyboard focus. */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The X that closes a notice or the outcome at the foot of a tool pane, as the X of a banner at the foot of a pane
 * of ArcGIS Pro does. It looks as the close button of a pane, and it has the name of the close button of a message
 * over the map.
 */
export function CloseButton({ onClick }: CloseButtonProps) {
  return (
    <button type="button" className="notice-close" aria-label="Close this message" onClick={onClick}>
      <Icon name="close" />
    </button>
  );
}

/**
 * A message inside a pane: one compact block with an icon, a bar at its left, the text, at most one button and, at
 * its right end, the X that closes it. It takes the place of a loose paragraph. The text is announced as a status,
 * and the text of an error as an alert, the two roles that the alert of the U.S. Web Design System names for them.
 *
 * A closed notice stays closed until its text changes or its pane opens again. A notice with an `id` belongs to the
 * field that names it in `aria-describedby`, so it has no X.
 *
 *     <Notice kind="warning" action={{ label: "Sign in", onClick: () => openToolPane("sign-in") }}>
 *       You are not signed in to Earthdata. A layer is requested with your Earthdata account.
 *     </Notice>
 */
export function Notice({ kind, id, action, children }: NoticeProps) {
  const words = `${kind}: ${wordsOf(children)}`;
  // The words of the notice when the user closed it, or null while it is open. Other words open it again.
  const [closed, setClosed] = useState<string | null>(null);
  if (closed !== null && closed !== words) {
    setClosed(null);
  }
  const closable = id === undefined;

  if (closable && closed === words) {
    return null;
  }

  // The X leaves the page with the notice. When it had the keyboard focus, the focus moves to the title of the pane
  // or of the dialog, where it also stands when the pane opens.
  const close = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (document.activeElement === button) {
      button.closest(".pane, .dialog")?.querySelector<HTMLElement>(".pane-title, .usa-modal__heading")?.focus();
    }
    setClosed(words);
  };

  return (
    <div className={closable ? `notice notice--${kind} notice--closable` : `notice notice--${kind}`}>
      <Icon name={ICONS[kind]} />
      <div className="notice-text" id={id} role={kind === "error" ? "alert" : "status"}>
        {children}
      </div>
      {action ? (
        <button type="button" className="usa-button usa-button--outline" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {closable ? <CloseButton onClick={close} /> : null}
    </div>
  );
}
