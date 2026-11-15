// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

interface ToolbarProps {
  /** Name of the toolbar for assistive technology, for example "Commands of the layer". */
  label: string;
  /** The buttons: `IconButton` and `MenuButton` elements. */
  children: ReactNode;
}

/** The buttons of a toolbar. The commands of a menu that one of them has opened are not among them. */
const CONTROLS = 'button:not([role^="menuitem"])';

/**
 * A row of icon buttons that belong together, as the toolbar pattern of the ARIA Authoring Practices Guide
 * describes it. The Tab key reaches the toolbar once and leaves it with the next press. Inside it the Left and
 * Right arrow keys move between the buttons and pass from the last to the first, and Home and End reach the
 * ends. The Tab key returns to the button that had the focus last. The pattern asks for a toolbar only where
 * three or more buttons stand together.
 *
 *     <Toolbar label="Commands of the layer">
 *       <IconButton icon="zoom_in" label="Zoom to the layer" onClick={zoom} />
 *       <IconButton icon="tune" label="Symbology" onClick={style} />
 *       <MenuButton icon="more_vert" label="More" items={[{ label: "Remove", onSelect: remove }]} />
 *     </Toolbar>
 */
export function Toolbar({ label, children }: ToolbarProps) {
  const bar = useRef<HTMLDivElement>(null);

  const controls = () => [...(bar.current?.querySelectorAll<HTMLElement>(CONTROLS) ?? [])];

  // One button is in the order of the Tab key: the one that had the focus last, or the first.
  const setStop = (stop: HTMLElement | undefined) => {
    for (const control of controls()) {
      control.tabIndex = control === stop ? 0 : -1;
    }
  };

  // The buttons may change with every drawing, so the stop is set again after each one.
  useLayoutEffect(() => {
    const all = controls();
    setStop(all.find((control) => control.tabIndex === 0) ?? all[0]);
  });

  const onFocus = (event: FocusEvent) => {
    const control = controls().find((candidate) => candidate === event.target);
    if (control) {
      setStop(control);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const all = controls();
    const current = all.findIndex((control) => control === event.target);
    if (current === -1) {
      return;
    }
    const move = (index: number) => {
      event.preventDefault();
      all.at(index % all.length)?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
        move(current + 1);
        break;
      case "ArrowLeft":
        move(current - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(-1);
        break;
    }
  };

  return (
    <div ref={bar} className="toolbar" role="toolbar" aria-label={label} onFocus={onFocus} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
