// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { Icon } from "../icon/Icon";

interface DialogProps {
  /** Heading of the dialog. */
  title: string;
  open: boolean;
  /** Called when the user closes the dialog: with its close button, with the Escape key or with a click outside it. */
  onClose: () => void;
  /** A wider dialog, for a form with many fields. */
  large?: boolean;
  /** The buttons at the foot of the dialog. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A dialog over the page, with the look of the modal of the U.S. Web Design System, for a confirmation or a
 * notice. The form of a tool opens in a pane instead (see `ToolPane`). It is the dialog element of the browser,
 * opened as a modal: the browser keeps the keyboard focus inside it, closes it on the Escape key and returns the
 * focus to the element that opened it.
 *
 * The first focus goes to the heading, as the ARIA Authoring Practices Guide advises for content that has to be
 * read from its start. The heading shows the focus line only when the keyboard opened the dialog.
 */
export function Dialog({ title, open, onClose, large = false, footer, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      // The element that opens the dialog shows the focus line only when the keyboard reached it.
      const byKeyboard = document.activeElement?.matches(":focus-visible") ?? false;
      element.dataset.opened = byKeyboard ? "keyboard" : "pointer";
      element.showModal();
      heading.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // A click on the shaded page around the dialog reaches the dialog element itself and not its content.
  const onClick = (event: MouseEvent) => {
    const element = dialog.current;
    if (element && event.target === element) {
      element.close();
    }
  };

  return (
    <dialog
      ref={dialog}
      className={large ? "usa-modal usa-modal--lg dialog" : "usa-modal dialog"}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={onClick}
    >
      <div className="usa-modal__content">
        <div className="usa-modal__main">
          <h2 className="usa-modal__heading" id={headingId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {children}
          {footer ? <div className="usa-modal__footer">{footer}</div> : null}
        </div>
        <button
          type="button"
          className="usa-button usa-modal__close"
          aria-label="Close this window"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
    </dialog>
  );
}
