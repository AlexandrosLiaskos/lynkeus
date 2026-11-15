// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import sprite from "@uswds/uswds/img/sprite.svg";

interface IconProps {
  /** Name of the icon in the icon set of the U.S. Web Design System. */
  name: string;
  /** Size of the icon, in the units of the design system: 3 is 24 pixels and 4 is 32 pixels. */
  size?: 3 | 4;
}

/** An icon of the U.S. Web Design System. It is decoration: the element that holds it carries the name. */
export function Icon({ name, size }: IconProps) {
  return (
    <svg className={size ? `usa-icon usa-icon--size-${String(size)}` : "usa-icon"} aria-hidden="true" focusable="false">
      <use href={`${sprite}#${name}`} />
    </svg>
  );
}
