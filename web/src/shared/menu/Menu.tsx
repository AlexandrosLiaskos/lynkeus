// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Icon } from "../icon/Icon";

/** A command of a menu. */
export interface MenuItem {
  id: string;
  label: string;
  /** An inactive command stays in the menu and can take the focus, and it does nothing. */
  disabled?: boolean;
  /** A command that switches something on and off states here whether it is on. */
  checked?: boolean;
  /** A line is drawn above the command, to part it from the group before it. */
  separated?: boolean;
  run: () => void;
}

interface MenuProps {
  /** Name of the menu for assistive technology. */
  label: string;
  /** The id of the element of the menu, for the `aria-controls` attribute of the button that opens it. */
  id?: string;
  items: readonly MenuItem[];
  /** The point of the window at which the menu opens, in pixels. */
  at: { x: number; y: number };
  /** The command that receives the focus when the menu opens. */
  focus: "first" | "last";
  /** Called when the menu closes. `refocus` tells whether the focus returns to the element that opened it. */
  onClose: (refocus: boolean) => void;
}

/**
 * A menu of commands, as the menu and menu button patterns of the ARIA Authoring Practices Guide describe it.
 * The arrow keys move between the commands and pass from the last to the first, Home and End reach the ends, a
 * letter reaches the next command that starts with it, Enter or Space runs a command, and Escape closes the
 * menu and returns the focus to the element that opened it. The menu also closes when the focus leaves it and
 * when the pointer is pressed outside it.
 */
export function Menu({ label, id, items, at, focus, onClose }: MenuProps) {
  const menu = useRef<HTMLUListElement>(null);

  const commands = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  // The menu opens at the point given and moves as far as needed to stay inside the window.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) {
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${String(Math.max(0, Math.min(at.x, window.innerWidth - width)))}px`;
    element.style.top = `${String(Math.max(0, Math.min(at.y, window.innerHeight - height)))}px`;
    commands()
      .at(focus === "first" ? 0 : -1)
      ?.focus();
  }, [at.x, at.y, focus]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        onClose(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent) => {
    const all = commands();
    const current = all.findIndex((command) => command === document.activeElement);
    const move = (index: number) => {
      event.preventDefault();
      all.at(index % all.length)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(current + 1);
        break;
      case "ArrowUp":
        move(current - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(-1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
        break;
      case "Tab":
        onClose(false);
        break;
      default:
        if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const letter = event.key.toLowerCase();
          const order = items.map((_, index) => (current + 1 + index) % items.length);
          const next = order.find((index) => items[index]?.label.toLowerCase().startsWith(letter));
          if (next !== undefined) {
            all[next]?.focus();
          }
        }
    }
  };

  return (
    <ul
      ref={menu}
      id={id}
      className="menu"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          onClose(false);
        }
      }}
    >
      {items.map(({ id, label: name, disabled = false, checked, separated = false, run }) => (
        <li key={id} role="none" className={separated ? "menu-separated" : undefined}>
          <button
            type="button"
            role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
            tabIndex={-1}
            aria-checked={checked}
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onClose(true);
                run();
              }
            }}
          >
            <span className="menu-mark">{checked ? <Icon name="check" /> : null}</span>
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}
