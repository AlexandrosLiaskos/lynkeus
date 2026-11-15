// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
interface FieldErrorProps {
  /** The id of the element of the error. The field carries it in `aria-describedby` while the error shows. */
  id: string;
  /** What is wrong with the value and what to enter instead, or null while the field has no error. */
  children: string | null;
}

/**
 * The error of a field, in text under the field. It is announced as an alert when it appears. Every part of the
 * interface writes the error of a field with this element. The field carries `aria-invalid` and the id of the
 * error while the error shows, and the function `describedBy` joins that id with the id of the explanation:
 *
 *     <input
 *       className={fault ? "usa-input usa-input--error" : "usa-input"}
 *       id="buffer-distance"
 *       aria-invalid={fault ? true : undefined}
 *       aria-describedby={describedBy(infoId("buffer-distance"), fault && "buffer-distance-error")}
 *     />
 *     <FieldError id="buffer-distance-error">{fault}</FieldError>
 */
export function FieldError({ id, children }: FieldErrorProps) {
  return children === null ? null : (
    <p className="usa-error-message" id={id} role="alert">
      {children}
    </p>
  );
}

/** Return the value of `aria-describedby` for the ids given. An id that is null or empty is left out. */
export function describedBy(...ids: (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null && id !== "");
  return present.length === 0 ? undefined : present.join(" ");
}
