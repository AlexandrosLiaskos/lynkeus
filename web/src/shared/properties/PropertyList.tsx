import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { copyText } from "../clipboard";
import { Info } from "../info/Info";
import { report } from "../messages/messages";
import { IconButton } from "../toolbar/IconButton";

/** The time for which a row states that its value was copied, in milliseconds. */
export const COPIED_TIME = 2000;

interface PropertyBase {
  /** Name of the property in plain words, never the name of a field of a catalogue or of a service. */
  name: string;
  /** The explanation of the property. The name that a catalogue or a service gives to it belongs here. */
  info?: string;
}

/**
 * A row of a property list. `copy` adds a button that copies the value: `true` copies a value that is a text or
 * a number as it is shown, and a text copies that text, for a value that is shown in another form.
 */
export type Property = PropertyBase &
  ({ value: string | number; copy?: boolean | string } | { value: ReactNode; copy?: string });

/** A group of rows, under a short heading when it has one. */
export interface PropertyGroup {
  title?: string;
  rows: readonly Property[];
}

interface PropertyListProps {
  groups: readonly PropertyGroup[];
}

/** Return the text that the copy button of a row copies, or null for a row without the button. */
function copied({ value, copy }: Property): string | null {
  if (typeof copy === "string") {
    return copy;
  }
  return copy === true && (typeof value === "string" || typeof value === "number") ? String(value) : null;
}

/**
 * The properties of an object as names and values, in groups under short headings. It is a description list
 * (`dl`). A value wraps inside its column, so a long identifier does not widen the pane, and a row may carry a
 * button that copies its value and an "i" with its explanation.
 *
 *     <PropertyList
 *       groups={[
 *         { title: "Orbit", rows: [{ name: "Track", value: 141 }, { name: "Direction", value: "Ascending" }] },
 *         { rows: [{ name: "Identifier", value: product.id, copy: true, info: "The field GranuleUR." }] },
 *       ]}
 *     />
 */
export function PropertyList({ groups }: PropertyListProps) {
  const id = useId();
  // The key of the row whose value was copied last, while the row states it.
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = (key: string, text: string) => {
    copyText(text).then(
      () => {
        window.clearTimeout(timer.current);
        setDone(key);
        timer.current = window.setTimeout(() => setDone(null), COPIED_TIME);
      },
      () => report("error", "The browser did not allow the copy. Select the value and copy it with the keyboard."),
    );
  };

  return (
    <div className="property-list">
      {groups.map(({ title, rows }, groupIndex) => (
        <div className="property-group" key={title ?? groupIndex}>
          {title ? <h4 className="property-group-title">{title}</h4> : null}
          <dl className="property-rows">
            {rows.map((row, rowIndex) => {
              const key = `${id}-${String(groupIndex)}-${String(rowIndex)}`;
              const text = copied(row);
              return (
                <div className="property-row" key={key}>
                  <dt className="property-name">
                    <span>{row.name}</span>
                    {row.info ? (
                      <Info id={`${key}-info`} about={row.name}>
                        {row.info}
                      </Info>
                    ) : null}
                  </dt>
                  <dd className="property-value">
                    <span className="property-value-text">{row.value}</span>
                    {text === null ? null : (
                      <IconButton
                        icon={done === key ? "check" : "content_copy"}
                        label={`Copy ${row.name}`}
                        onClick={() => copy(key, text)}
                      />
                    )}
                    {done === key ? (
                      <span className="property-copied" role="status">
                        Copied
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
