// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useRef, useState, type MouseEvent } from "react";
import { baseMapStore, type BaseMapId } from "../map/baseMaps";
import { MAP_TAB } from "../map/tab";
import { MenuButton } from "../shared/menu/MenuButton";
import { createStore, useStore } from "../shared/store";
import { Menu, type MenuItem } from "./Menu";

/** The id of the row of the map, which receives the focus when the basemap is removed. */
export const MAP_ROW_ID = "contents-map";

/** Return the name of a basemap: the label of its button on the Map tab. */
export function basemapName(id: BaseMapId): string {
  const tools = MAP_TAB.groups.flatMap((group): readonly { id: string; label: string }[] => group.tools);
  return tools.find((tool) => tool.id === id || tool.id.startsWith(`${id}-`))?.label ?? id;
}

/**
 * The basemap that the Contents pane lists, or null after the Remove command. A basemap chosen on the Map tab
 * takes the place of the listed one. A hidden basemap stays listed, with its box cleared.
 */
export const listedBasemapStore = createStore<BaseMapId | null>(baseMapStore.get());

baseMapStore.subscribe(() => {
  const shown = baseMapStore.get();
  if (shown !== null) {
    listedBasemapStore.set(shown);
  }
});

/**
 * The basemap, the bottom layer of the map: its box shows or hides it, and its menu removes it. Its row has the
 * columns of the row of a layer, so that the boxes and the names of all the rows stand in line. The right mouse
 * button opens the same menu at the pointer.
 */
export function BasemapItem() {
  const shown = useStore(baseMapStore);
  const listed = useStore(listedBasemapStore);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  if (listed === null) {
    return null;
  }
  const name = basemapName(listed);

  const items: MenuItem[] = [
    {
      id: "remove",
      label: "Remove",
      // The menu closes before the command runs, and the row is then gone, so the focus moves to the map.
      run: () => {
        baseMapStore.set(null);
        listedBasemapStore.set(null);
        document.getElementById(MAP_ROW_ID)?.focus();
      },
    },
  ];

  // The name of the basemap is not a button, so the focus returns from the menu at the pointer to the menu button.
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    opener.current = event.currentTarget.querySelector<HTMLElement>('button[aria-haspopup="menu"]');
    setMenu({ x: event.clientX, y: event.clientY });
  };

  const closeMenu = (refocus: boolean) => {
    setMenu(null);
    if (refocus) {
      opener.current?.focus();
    }
  };

  return (
    <li className="contents-layer contents-basemap">
      <div className="contents-row" onContextMenu={onContextMenu}>
        <span className="contents-fold" aria-hidden="true" />
        <label className="contents-visible">
          <input
            type="checkbox"
            checked={shown === listed}
            aria-label={`Show ${name}`}
            onChange={(event) => baseMapStore.set(event.target.checked ? listed : null)}
          />
        </label>
        <span className="contents-basemap-name item-title">{name}</span>
        <MenuButton
          icon="more_vert"
          label="More"
          name={`More commands of ${name}`}
          items={items.map(({ label, run }) => ({ label, onSelect: run }))}
        />
      </div>
      {menu && <Menu label={`More commands of ${name}`} items={items} at={menu} focus="first" onClose={closeMenu} />}
    </li>
  );
}
