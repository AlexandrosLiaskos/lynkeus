import { Info } from "../shared/info/Info";

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

/** The label of a field of the search, with the button of its explanation beside it. */
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
