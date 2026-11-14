import sprite from "@uswds/uswds/img/sprite.svg";
import type { KeyboardEvent } from "react";
import { RIBBON, type TabId, type ToolId } from "./ribbon";

/** What each finished tool does. A tool without an entry is shown in grey. */
export type ToolActions = Partial<Record<ToolId, { run: () => void; pressed?: boolean }>>;

interface RibbonTabsProps {
  selected: TabId;
  onSelect: (tab: TabId) => void;
}

/** The tabs of the ribbon. The left and right arrow keys move between them. */
export function RibbonTabs({ selected, onSelect }: RibbonTabsProps) {
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const current = RIBBON.findIndex(({ id }) => id === selected);
    const next = RIBBON[(current + step + RIBBON.length) % RIBBON.length];
    if (step !== 0 && next) {
      onSelect(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  };

  return (
    <div className="ribbon-tabs" role="tablist" aria-label="Tools" onKeyDown={onKeyDown}>
      {RIBBON.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={id === selected}
          aria-controls="ribbon-panel"
          tabIndex={id === selected ? 0 : -1}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface RibbonPanelProps {
  selected: TabId;
  actions: ToolActions;
}

/** The groups of tools of the selected tab. */
export function RibbonPanel({ selected, actions }: RibbonPanelProps) {
  const groups = RIBBON.find(({ id }) => id === selected)?.groups ?? [];

  return (
    <div className="ribbon-panel" role="tabpanel" id="ribbon-panel" aria-labelledby={`tab-${selected}`}>
      {groups.map(({ label, tools }) => (
        <div key={label} className="ribbon-group" role="group" aria-label={label}>
          <div className="ribbon-tools">
            {tools.map(({ id, label, icon }) => {
              const action = actions[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="ribbon-tool"
                  disabled={!action}
                  aria-pressed={action?.pressed}
                  title={action ? undefined : "Not yet available"}
                  onClick={action?.run}
                >
                  <svg className="usa-icon usa-icon--size-3" aria-hidden="true" focusable="false">
                    <use href={`${sprite}#${icon}`} />
                  </svg>
                  {label}
                </button>
              );
            })}
          </div>
          <div className="ribbon-group-label" aria-hidden="true">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
