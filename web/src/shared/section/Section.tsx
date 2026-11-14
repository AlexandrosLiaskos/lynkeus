import { useId, useState, type ReactNode } from "react";
import { Icon } from "../icon/Icon";
import { Info } from "../info/Info";

interface SectionProps {
  /** Name of the section, shown in bold on its header. */
  title: string;
  /** The number of the items of the section, shown in parentheses after the title. */
  count?: number;
  /** The explanation of the section, in complete sentences. It shows from the "i" beside the title. */
  info?: ReactNode;
  /** The commands of the section, at the right end of its header. A press on one leaves the section as it is. */
  actions?: ReactNode;
  /** Whether the section starts open. */
  defaultOpen?: boolean;
  /** Whether the section is open, for a component that holds this state itself. Without it the section holds it. */
  open?: boolean;
  /** Called with the new state when the user opens or closes the section. */
  onToggle?: (open: boolean) => void;
  /** The id of the element of the section. */
  id?: string;
  children: ReactNode;
}

/**
 * A section of a pane that opens and closes: a header with an arrow, the title, the count of its items and its
 * commands, and under the header the content. The title is a button with the attributes `aria-expanded` and
 * `aria-controls`, as the disclosure pattern of the ARIA Authoring Practices Guide describes it. A closed
 * section keeps its content in the page, hidden, so the content keeps its state.
 *
 *     <Section title="Layers" count={layers.length} actions={<IconButton icon="add" label="Add" onClick={add} />}>
 *       <ul className="item-list">…</ul>
 *     </Section>
 */
export function Section({
  title,
  count,
  info,
  actions,
  defaultOpen = true,
  open,
  onToggle,
  id,
  children,
}: SectionProps) {
  const [own, setOwn] = useState(defaultOpen);
  const toggleId = useId();
  const bodyId = useId();
  const infoId = useId();
  const shown = open ?? own;

  const toggle = () => {
    setOwn(!shown);
    onToggle?.(!shown);
  };

  return (
    <div className="section" id={id}>
      <div className="section-header">
        <h3 className="section-heading">
          <button
            type="button"
            className="section-toggle"
            id={toggleId}
            aria-expanded={shown}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <Icon name="expand_more" />
            <span className="section-title">{title}</span>
            {count === undefined ? null : <span className="section-count"> ({count})</span>}
          </button>
        </h3>
        {info ? (
          <Info id={infoId} about={title}>
            {info}
          </Info>
        ) : null}
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      <div
        className="section-body"
        id={bodyId}
        role="group"
        aria-labelledby={toggleId}
        aria-describedby={info ? infoId : undefined}
        hidden={!shown}
      >
        {children}
      </div>
    </div>
  );
}
