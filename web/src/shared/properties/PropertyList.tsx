import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { copyText } from "../clipboard";
import { Info } from "../info/Info";
import { report } from "../messages/messages";
import { IconButton } from "../toolbar/IconButton";

/** The time for which a row states that its value was copied, in milliseconds. */
export const COPIED_TIME = 2000;

interface PropertyBase {
  /**
   * A text that names the row among the rows of its group and stays the same while the list changes. A row
   * without one is known by its name and its position among the rows of the same name.
   */
  id?: string;
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
  /**
   * A text that names the group among the groups of the list and stays the same while the list changes, such as
   * the id of the layer that the group describes. A group without one is known by its title and its position
   * among the groups of the same title.
   */
  id?: string;
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
 * Return for each element of a list a key that stays the same while other elements enter and leave the list: the
 * id of the element or, for an element without one, its name with its position among the elements of that name.
 * Two elements of one name therefore have different keys.
 */
export function stableKeys(items: readonly { id?: string; name: string }[]): string[] {
  const seen = new Map<string, number>();
  return items.map(({ id, name }) => {
    if (id !== undefined) {
      return JSON.stringify(["id", id]);
    }
    const position = (seen.get(name) ?? 0) + 1;
    seen.set(name, position);
    return JSON.stringify(["name", name, position]);
  });
}

interface PropertyRowProps {
  row: Property;
  /** Whether the row states that its value was copied. */
  done: boolean;
  /** Called with the text to copy when the copy button of the row is pressed. */
  onCopy: (text: string) => void;
}

/** One row of a property list: the name with its "i", and the value with its copy button. */
function PropertyRow({ row, done, onCopy }: PropertyRowProps) {
  const infoId = useId();
  const text = copied(row);
  return (
    <div className="property-row">
      <dt className="property-name">
        <span>{row.name}</span>
        {row.info ? (
          <Info id={infoId} about={row.name}>
            {row.info}
          </Info>
        ) : null}
      </dt>
      <dd className="property-value">
        <span className="property-value-text">{row.value}</span>
        {text === null ? null : (
          <IconButton icon={done ? "check" : "content_copy"} label={`Copy ${row.name}`} onClick={() => onCopy(text)} />
        )}
        {done ? (
          <span className="property-copied" role="status">
            Copied
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * The properties of an object as names and values, in groups under short headings. It is a description list
 * (`dl`). A value wraps inside its column, so a long identifier does not widen the pane, and a row may carry a
 * button that copies its value and an "i" with its explanation.
 *
 * A group and a row keep their elements while other groups and rows enter and leave the list (see `stableKeys`),
 * so a press on a copy button is not lost when the list grows. Groups of one title, or rows of one name, that
 * may change their order take an `id`.
 *
 *     <PropertyList
 *       groups={[
 *         { title: "Orbit", rows: [{ name: "Track", value: 141 }, { name: "Direction", value: "Ascending" }] },
 *         { id: layer.id, title: layer.title, rows: [{ name: "Identifier", value: product.id, copy: true }] },
 *       ]}
 *     />
 */
export function PropertyList({ groups }: PropertyListProps) {
  // The keys of the group and of the row whose value was copied last, while the row states it.
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const groupKeys = stableKeys(groups.map(({ id, title }) => ({ id, name: title ?? "" })));

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
      {groups.map(({ title, rows }, groupIndex) => {
        const groupKey = groupKeys[groupIndex] ?? String(groupIndex);
        const rowKeys = stableKeys(rows);
        return (
          <div className="property-group" key={groupKey}>
            {title ? <h4 className="property-group-title">{title}</h4> : null}
            <dl className="property-rows">
              {rows.map((row, rowIndex) => {
                const rowKey = rowKeys[rowIndex] ?? String(rowIndex);
                const key = `${groupKey} ${rowKey}`;
                return <PropertyRow key={rowKey} row={row} done={done === key} onCopy={(text) => copy(key, text)} />;
              })}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
