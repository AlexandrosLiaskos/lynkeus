// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
interface EmptyStateProps {
  /** What is missing, in a few words, for example "No products". */
  title: string;
  /** How the user gets it, in one sentence. */
  text?: string;
  /** The button that leads to the next step. */
  action?: { label: string; onClick: () => void };
}

/**
 * What a pane or a section shows while it has nothing to list: what is missing in one bold line, how the user
 * gets it in one sentence, and one button that leads to the next step. A new user learns from it what to do
 * first.
 *
 *     <EmptyState
 *       title="No products"
 *       text="Search NASA's catalogue to list the products of an area."
 *       action={{ label: "Search products", onClick: () => openToolPane("search") }}
 *     />
 */
export function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {text ? <p className="empty-state-text">{text}</p> : null}
      {action ? (
        <button type="button" className="usa-button usa-button--outline" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
