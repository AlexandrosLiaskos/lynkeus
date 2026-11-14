import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../icon/Icon";
import { Tooltip } from "../tooltip/Tooltip";
import { Menu, type MenuItem } from "./Menu";

/** A command of the menu of a menu button. */
export interface MenuButtonItem {
  label: string;
  onSelect: () => void;
  /** An inactive command stays in the menu and can take the focus, and it does nothing. */
  disabled?: boolean;
  /** A command that switches something on and off states here whether it is on. */
  checked?: boolean;
  /** A line is drawn above the command, to part it from the group before it. */
  separated?: boolean;
}

interface MenuButtonProps {
  /** Name of the button and of its menu, for example "More" or "Save as". */
  label: string;
  /**
   * Name of an icon in the icon set of the U.S. Web Design System. With it the button shows the icon alone, as an
   * `IconButton` does, and its name shows in a tooltip. Without it the button shows its name and an arrow.
   */
  icon?: string;
  items: readonly MenuButtonItem[];
}

/**
 * A button that opens a menu of commands under itself, as the menu button pattern of the ARIA Authoring
 * Practices Guide describes it. A press, the Enter key, the Space key or the Down arrow key opens the menu with
 * the focus on its first command, and the Up arrow key opens it with the focus on its last. A second press on the
 * button closes the menu. After a command or the Escape key the focus returns to the button. The keys inside the
 * menu are those of `Menu`.
 *
 *     <MenuButton
 *       label="Save as"
 *       items={[
 *         { label: "CSV", onSelect: saveCsv },
 *         { label: "GeoJSON", onSelect: saveGeoJson },
 *       ]}
 *     />
 *     <MenuButton icon="more_vert" label="More" items={[{ label: "Remove", onSelect: remove }]} />
 */
export function MenuButton({ label, icon, items }: MenuButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // Whether the press that is going on has closed the menu: the menu closes before the click arrives.
  const closedByPress = useRef(false);
  const [opened, setOpened] = useState<{ at: { x: number; y: number }; focus: "first" | "last" } | null>(null);

  const open = (focus: "first" | "last") => {
    const box = button.current?.getBoundingClientRect();
    setOpened({ at: { x: box?.left ?? 0, y: box?.bottom ?? 0 }, focus });
  };

  const close = (refocus: boolean) => {
    setOpened(null);
    if (refocus) {
      button.current?.focus();
    }
  };

  const onClick = () => {
    if (closedByPress.current) {
      closedByPress.current = false;
    } else if (opened) {
      close(false);
    } else {
      open("first");
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowDown" ? "first" : "last");
    }
  };

  const commands: MenuItem[] = items.map(({ label: name, onSelect, disabled, checked, separated }, index) => ({
    id: String(index),
    label: name,
    disabled,
    checked,
    separated,
    run: onSelect,
  }));

  // A press on the button while its menu is open closes the menu, so the click that follows does not open it.
  const onPointerDown = () => {
    closedByPress.current = opened !== null;
  };

  return (
    <>
      {icon ? (
        <Tooltip title={label}>
          {() => (
            <button
              ref={button}
              type="button"
              className="icon-button"
              aria-label={label}
              aria-haspopup="menu"
              aria-expanded={opened ? true : undefined}
              aria-controls={opened ? menuId : undefined}
              onPointerDown={onPointerDown}
              onClick={onClick}
              onKeyDown={onKeyDown}
            >
              <Icon name={icon} />
            </button>
          )}
        </Tooltip>
      ) : (
        <button
          ref={button}
          type="button"
          className="usa-button usa-button--outline menu-button"
          aria-haspopup="menu"
          aria-expanded={opened ? true : undefined}
          aria-controls={opened ? menuId : undefined}
          onPointerDown={onPointerDown}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          {label}
          <Icon name="expand_more" />
        </button>
      )}
      {opened ? (
        <Menu id={menuId} label={label} items={commands} at={opened.at} focus={opened.focus} onClose={close} />
      ) : null}
    </>
  );
}
