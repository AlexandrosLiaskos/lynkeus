import { useId, type RefObject } from "react";

interface LinkFieldsProps {
  /** The address that opens Lynkeus with the map as it is now. */
  address: string;
  /** The field of the address, so that its text can be selected for copying. */
  field: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The fields of the link to the map: the address, which follows the map while the form is open, and what the
 * address holds. The fields fill the container that holds them.
 */
export function LinkFields({ address, field }: LinkFieldsProps) {
  const id = useId();
  return (
    <>
      <label className="usa-label" htmlFor={`${id}-address`}>
        Address of this map
      </label>
      <textarea
        ref={field}
        className="usa-textarea share-address"
        id={`${id}-address`}
        value={address}
        readOnly
        rows={4}
        spellCheck={false}
        aria-describedby={`${id}-holds`}
        onFocus={(event) => event.target.select()}
      />
      <p className="usa-hint share-note" id={`${id}-holds`}>
        The address opens Lynkeus with the view of the map (its centre, zoom level and rotation), the background map and
        the area.
      </p>
      <p className="usa-hint share-note">
        The address does not hold the layers of the map. Lynkeus keeps the layers of a session for that session only, so
        the address cannot show them to another person.
      </p>
    </>
  );
}
