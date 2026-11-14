import { Info } from "../info/Info";

interface FieldTitleProps {
  /** The id of the field that the title names. The field carries `infoId(id)` in its `aria-describedby`. */
  field: string;
  /** The title of the field, as the page shows it. */
  title: string;
  /** The explanation of the field, in complete sentences. */
  children: string;
}

/** Return the id of the element that holds the explanation of a field. */
export function infoId(field: string): string {
  return `${field}-info`;
}

/**
 * The label of a field, with the button of its explanation beside it.
 *
 *     <FieldTitle field="buffer-distance" title="Distance (m)">
 *       The width of the buffer, as a number greater than zero, for example 250.
 *     </FieldTitle>
 *     <input className="usa-input" id="buffer-distance" aria-describedby={infoId("buffer-distance")} />
 */
export function FieldTitle({ field, title, children }: FieldTitleProps) {
  return (
    <div className="info-title">
      <label className="usa-label" htmlFor={field}>
        {title}
      </label>
      <Info id={infoId(field)} about={title}>
        {children}
      </Info>
    </div>
  );
}
