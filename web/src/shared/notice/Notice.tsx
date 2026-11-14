import type { ReactNode } from "react";
import { Icon } from "../icon/Icon";

/** The kinds of notice, as in the alert of the U.S. Web Design System. */
export type NoticeKind = "info" | "success" | "warning" | "error";

interface NoticeProps {
  kind: NoticeKind;
  /** The button of the notice, when the user can do something about what it states. */
  action?: { label: string; onClick: () => void };
  /** What happened and what to do next, in at most two sentences. */
  children: ReactNode;
}

const ICONS = { info: "info", success: "check_circle", warning: "warning", error: "error" } as const;

/**
 * A message inside a pane: one compact block with an icon, a bar at its left, the text and at most one button.
 * It takes the place of a loose paragraph. The text is announced as a status, and the text of an error as an
 * alert, the two roles that the alert of the U.S. Web Design System names for them.
 *
 *     <Notice kind="warning" action={{ label: "Sign in", onClick: () => openToolPane("sign-in") }}>
 *       You are not signed in to Earthdata. A layer is requested with your Earthdata account.
 *     </Notice>
 */
export function Notice({ kind, action, children }: NoticeProps) {
  return (
    <div className={`notice notice--${kind}`}>
      <Icon name={ICONS[kind]} />
      <div className="notice-text" role={kind === "error" ? "alert" : "status"}>
        {children}
      </div>
      {action ? (
        <button type="button" className="usa-button usa-button--outline" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
