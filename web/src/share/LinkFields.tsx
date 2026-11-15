// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, type RefObject } from "react";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Notice } from "../shared/notice/Notice";

interface LinkFieldsProps {
  /** The address that opens Lynkeus with the map as it is now. */
  address: string;
  /** The field of the address, so that its text can be selected for copying. */
  field: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The fields of the link to the map: the address, which follows the map while the form is open, with what it
 * holds behind the "i" beside its title, and a notice of what it does not hold. The fields fill the container
 * that holds them.
 */
export function LinkFields({ address, field }: LinkFieldsProps) {
  const id = useId();
  return (
    <>
      <FieldTitle field={`${id}-address`} title="Address">
        The address opens Lynkeus with the same view of the map (centre, zoom level and rotation), the same basemap and
        the same area.
      </FieldTitle>
      <textarea
        ref={field}
        className="usa-textarea share-address"
        id={`${id}-address`}
        value={address}
        readOnly
        rows={4}
        spellCheck={false}
        aria-describedby={infoId(`${id}-address`)}
        onFocus={(event) => event.target.select()}
      />
      <Notice kind="info">
        The address does not hold the layers of the map. Lynkeus keeps the layers of a session for that session only, so
        the address cannot show them to another person.
      </Notice>
    </>
  );
}
