import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
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
 *
 * A double click on a tab, Control+F1 or the button at the end of the row of tabs collapses the ribbon to its row
 * of tabs, and expands it again. On a collapsed ribbon a click on a tab shows the groups of the tab over the map
 * for a while, as in an office program: until a button has run or the user turns to another part of the page.
 */
export function Ribbon({ tabs, actions }: RibbonProps) {
  const [selected, setSelected] = useState(tabs[0]?.id);
  // The button that last had the keyboard focus. The Tab key returns to it.
  const [lastTool, setLastTool] = useState<string>();
  const [collapsed, setCollapsed] = useState(false);
  // Whether a collapsed ribbon shows its groups for a while.
  const [opened, setOpened] = useState(false);
  const ribbon = useRef<HTMLDivElement>(null);
  const shown = !collapsed || opened;
  const groups = tabs.find(({ id }) => id === selected)?.groups ?? [];
  const buttons = groups.flatMap((group) => group.tools);
  const stop = tabStop(
    buttons.map(({ id }) => ({ id, finished: actions[id] !== undefined })),
    lastTool,
  );

  // The focus leaves a button that is about to hide, and goes to the selected tab.
  const leavePanel = () => {
    if (selected && document.getElementById("ribbon-panel")?.contains(document.activeElement)) {
      focusOn(tabId(selected));
    }
  };

  const toggleCollapsed = () => {
    if (!collapsed) {
      leavePanel();
    }
    setCollapsed(!collapsed);
    setOpened(false);
  };

  // Control+F1 collapses and expands the ribbon from any part of the page, as in Microsoft Office and in
  // ArcGIS Pro. An open dialog keeps the key to itself.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const inDialog = event.target instanceof Element && event.target.closest("dialog") !== null;
      if (event.key === "F1" && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !inDialog) {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // The groups that a collapsed ribbon shows for a while hide when the pointer presses another part of the page,
  // when the keyboard focus goes there, and on the Escape key.
  useEffect(() => {
    if (!collapsed || !opened) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && ribbon.current?.contains(event.target))) {
        setOpened(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [collapsed, opened]);

  const onBlur = (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
      setOpened(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && collapsed && opened) {
      leavePanel();
      setOpened(false);
    }
  };

  // On a collapsed ribbon a click on a tab shows its groups, and a click on the tab that shows them hides them.
  const onTabClick = (id: string) => {
    if (collapsed) {
      setOpened(!(opened && id === selected));
    }
    setSelected(id);
  };

  // A button runs its action. On a collapsed ribbon the groups hide first and the focus goes to the tab, to which
  // a pane or a dialog that the action opens returns it.
  const runTool = (run: () => void) => {
    if (collapsed) {
      leavePanel();
      setOpened(false);
    }
    run();
  };

  // On a tab, the left and right arrow keys, Home and End move between the tabs, and the down arrow key moves to
  // the buttons, as in an office program.
  const onTabKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === "ArrowDown" && stop) {
      event.preventDefault();
      // A collapsed ribbon first shows its groups, so that the button can take the focus.
      if (!shown) {
        flushSync(() => setOpened(true));
      }
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
    // The description of the button that collapses the ribbon shows under the whole ribbon, as the descriptions
    // of the other buttons show under the panel.
    <div
      ref={ribbon}
      className={collapsed ? "ribbon ribbon--collapsed" : "ribbon"}
      data-tooltip-row
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <div className="ribbon-tabs" role="tablist" aria-label="Ribbon" onKeyDown={onTabKeyDown}>
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabId(id)}
            aria-selected={id === selected}
            aria-expanded={id === selected ? shown : undefined}
            aria-controls="ribbon-panel"
            tabIndex={id === selected ? 0 : -1}
            onClick={() => onTabClick(id)}
            onDoubleClick={toggleCollapsed}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="ribbon-panel"
        role="tabpanel"
        id="ribbon-panel"
        data-tooltip-row
        aria-labelledby={selected ? `ribbon-tab-${selected}` : undefined}
      >
        {/* A collapsed ribbon holds no buttons, and the style hides its empty panel. */}
        {shown ? (
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
                      <Tooltip
                        key={id}
                        title={label}
                        text={description}
                        note={action ? undefined : "Not yet available."}
                      >
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
                            onClick={action ? () => runTool(action.run) : undefined}
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
        ) : null}
      </div>
      <Tooltip
        title="Collapse the ribbon"
        text="Hides the groups of buttons and leaves the row of tabs."
        note="Ctrl+F1 and a double click on a tab do the same."
      >
        {(describedBy) => (
          // The button stands after the groups in the order of the Tab key and at the end of the row of tabs on
          // the page. It stays switched on while the ribbon is collapsed.
          <button
            type="button"
            className="ribbon-collapse"
            aria-label="Collapse the ribbon"
            aria-pressed={collapsed}
            aria-describedby={describedBy}
            onClick={toggleCollapsed}
          >
            <Icon name="expand_less" />
          </button>
        )}
      </Tooltip>
    </div>
  );
}
