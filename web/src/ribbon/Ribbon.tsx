import { useState, type KeyboardEvent } from "react";
import { Icon } from "../shared/icon/Icon";
import { Tooltip } from "../shared/tooltip/Tooltip";
import { tabAfterKey, tabStop, toolAfterKey } from "./keys";
import type { RibbonTab, ToolActions } from "./types";

interface RibbonProps {
  tabs: readonly RibbonTab[];
  /** What each finished button does. A button without an entry is shown in grey. */
  actions: ToolActions;
}

const tabId = (id: string) => `ribbon-tab-${id}`;
const toolId = (id: string) => `ribbon-tool-${id}`;

/**
 * Move the keyboard focus to a tab or to a button. A button that a narrow window shows only in part is first
 * brought fully into view, which the browser does not do by itself, and its description then stands under it.
 */
function focusOn(id: string) {
  const element = document.getElementById(id);
  element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  element?.focus();
}

/**
 * The ribbon: a row of tabs and, under it, the groups of buttons of the selected tab. The row of tabs follows the
 * Tabs pattern of the ARIA Authoring Practices Guide and the buttons its Toolbar pattern: the Tab key stops once
 * on the row of tabs and once on the buttons, and the arrow keys move inside each of them.
 */
export function Ribbon({ tabs, actions }: RibbonProps) {
  const [selected, setSelected] = useState(tabs[0]?.id);
  // The button that last had the keyboard focus. The Tab key returns to it.
  const [lastTool, setLastTool] = useState<string>();
  const groups = tabs.find(({ id }) => id === selected)?.groups ?? [];
  const buttons = groups.flatMap((group) => group.tools);
  const stop = tabStop(
    buttons.map(({ id }) => ({ id, finished: actions[id] !== undefined })),
    lastTool,
  );

  // On a tab, the left and right arrow keys, Home and End move between the tabs, and the down arrow key moves to
  // the buttons, as in an office program.
  const onTabKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === "ArrowDown" && stop) {
      event.preventDefault();
      focusOn(toolId(stop));
      return;
    }
    const place = tabAfterKey(
      tabs.findIndex(({ id }) => id === selected),
      tabs.length,
      event.key,
    );
    const next = place === undefined ? undefined : tabs[place];
    if (next) {
      event.preventDefault();
      setSelected(next.id);
      focusOn(tabId(next.id));
    }
  };

  // On a button, the left and right arrow keys, Home and End move between the buttons, and the up arrow key
  // returns to the selected tab.
  const onToolKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.metaKey) {
      return;
    }
    if (event.key === "ArrowUp" && selected) {
      event.preventDefault();
      focusOn(tabId(selected));
      return;
    }
    const place = toolAfterKey(
      buttons.findIndex(({ id }) => toolId(id) === document.activeElement?.id),
      groups.map((group) => group.tools.length),
      event.key,
      event.ctrlKey,
    );
    const next = place === undefined ? undefined : buttons[place];
    if (next) {
      event.preventDefault();
      focusOn(toolId(next.id));
    }
  };

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Ribbon" onKeyDown={onTabKeyDown}>
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabId(id)}
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
        <div
          className="ribbon-groups"
          role="toolbar"
          aria-labelledby={selected ? tabId(selected) : undefined}
          onKeyDown={onToolKeyDown}
        >
          {groups.map(({ label, tools }) => (
            <div key={label} className="ribbon-group" role="group" aria-label={label}>
              <div className="ribbon-tools">
                {tools.map(({ id, label, icon, description }) => {
                  const action = actions[id];
                  return (
                    <Tooltip key={id} title={label} text={description} note={action ? undefined : "Not yet available."}>
                      {(describedBy) => (
                        // A button that is not finished stays in the reach of the keyboard, so that its description
                        // can be read. It is marked as inactive and does nothing.
                        <button
                          type="button"
                          id={toolId(id)}
                          className={label.split(" ").length > 2 ? "ribbon-tool ribbon-tool--wide" : "ribbon-tool"}
                          tabIndex={id === stop ? 0 : -1}
                          aria-disabled={action ? undefined : true}
                          aria-pressed={action?.pressed}
                          aria-describedby={describedBy}
                          onClick={action?.run}
                          onFocus={() => setLastTool(id)}
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
    </div>
  );
}
