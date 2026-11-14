import { useState, type KeyboardEvent } from "react";
import { Icon } from "../shared/icon/Icon";
import { Tooltip } from "../shared/tooltip/Tooltip";
import type { RibbonTab, ToolActions } from "./types";

interface RibbonProps {
  tabs: readonly RibbonTab[];
  /** What each finished button does. A button without an entry is shown in grey. */
  actions: ToolActions;
}

/** The ribbon: a row of tabs and, under it, the groups of buttons of the selected tab. */
export function Ribbon({ tabs, actions }: RibbonProps) {
  const [selected, setSelected] = useState(tabs[0]?.id);
  const groups = tabs.find(({ id }) => id === selected)?.groups ?? [];

  // The left and right arrow keys move between the tabs.
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const current = tabs.findIndex(({ id }) => id === selected);
    const next = tabs[(current + step + tabs.length) % tabs.length];
    if (step !== 0 && next) {
      setSelected(next.id);
      document.getElementById(`ribbon-tab-${next.id}`)?.focus();
    }
  };

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Ribbon" onKeyDown={onKeyDown}>
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`ribbon-tab-${id}`}
            aria-selected={id === selected}
            aria-controls="ribbon-panel"
            tabIndex={id === selected ? 0 : -1}
            onClick={() => setSelected(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="ribbon-panel"
        role="tabpanel"
        id="ribbon-panel"
        aria-labelledby={selected ? `ribbon-tab-${selected}` : undefined}
      >
        {groups.map(({ label, tools }) => (
          <div key={label} className="ribbon-group" role="group" aria-label={label}>
            <div className="ribbon-tools">
              {tools.map(({ id, label, icon, description }) => {
                const action = actions[id];
                return (
                  <Tooltip key={id} title={label} text={description} note={action ? undefined : "Not yet available."}>
                    {(describedBy) => (
                      // A button that is not finished stays in the order of the keyboard, so that its description
                      // can be read. It is marked as inactive and does nothing.
                      <button
                        type="button"
                        className={label.split(" ").length > 2 ? "ribbon-tool ribbon-tool--wide" : "ribbon-tool"}
                        aria-disabled={action ? undefined : true}
                        aria-pressed={action?.pressed}
                        aria-describedby={describedBy}
                        onClick={action?.run}
                      >
                        <Icon name={icon} size={4} />
                        {label}
                      </button>
                    )}
                  </Tooltip>
                );
              })}
            </div>
            <div className="ribbon-group-label" aria-hidden="true">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
