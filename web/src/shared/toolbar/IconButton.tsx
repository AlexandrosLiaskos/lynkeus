// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { Icon } from "../icon/Icon";
import { Tooltip } from "../tooltip/Tooltip";

interface IconButtonProps {
  /** Name of the icon in the icon set of the U.S. Web Design System. */
  icon: string;
  /** Name of the command. It is the accessible name of the button and the text of its tooltip. */
  label: string;
  onClick: () => void;
  /** For a button that switches something on and off: whether it is on. */
  pressed?: boolean;
  /** An inactive button stays in the order of the keyboard and does nothing. */
  disabled?: boolean;
  /** Why the button is inactive, in one sentence. The tooltip shows it, and a screen reader reads it with the name. */
  reason?: string;
}

/**
 * A button that shows an icon alone, in a target of 24 pixels. Its name shows in a tooltip while the pointer
 * rests on it or the keyboard focus is on it, and the same text names it for a screen reader. An inactive button
 * can still take the focus, so that its tooltip can state what is missing.
 *
 *     <IconButton icon="zoom_in" label="Zoom to the layer" onClick={zoom} />
 *     <IconButton icon="visibility" label="Show on the map" pressed={visible} onClick={toggle} />
 *     <IconButton icon="delete" label="Remove" disabled reason="The basemap cannot be removed." onClick={remove} />
 */
export function IconButton({ icon, label, onClick, pressed, disabled = false, reason }: IconButtonProps) {
  const note = disabled ? reason : undefined;
  return (
    <Tooltip title={label} text={note}>
      {(describedBy) => (
        <button
          type="button"
          className="icon-button"
          aria-label={label}
          aria-pressed={pressed}
          aria-disabled={disabled ? true : undefined}
          aria-describedby={note ? describedBy : undefined}
          onClick={() => {
            if (!disabled) {
              onClick();
            }
          }}
        >
          <Icon name={icon} />
        </button>
      )}
    </Tooltip>
  );
}
