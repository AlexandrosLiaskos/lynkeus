// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { EmptyState } from "../shared/empty/EmptyState";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { useMap } from "../shared/map";
import { MenuButton } from "../shared/menu/MenuButton";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import {
  BOOKMARK_FAULTS,
  bookmarksStore,
  NAME_LENGTH,
  removeBookmark,
  renameBookmark,
  saveBookmark,
  showBookmark,
  type Bookmark,
  type BookmarkFault,
} from "./bookmarks";
import { describedBy, FieldError } from "./FieldError";

/** The saved view that is being renamed: the text of its field and the error of that text. */
interface Renaming {
  id: number;
  name: string;
  fault: string | null;
}

/**
 * The pane of the button Bookmarks: a name under which the present view is saved, and the list of the saved
 * views. Each saved view has one button that returns the map to it, and a menu that renames and removes it. A
 * name that cannot be given is refused under its field.
 */
export function BookmarksPane() {
  const map = useMap();
  const id = useId();
  const bookmarks = useStore(bookmarksStore);
  const [name, setName] = useState("");
  const [nameFault, setNameFault] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const renameField = useRef<HTMLInputElement>(null);
  // The saved view whose first button takes the keyboard focus after the next drawing.
  const focusNext = useRef<number | null>(null);
  const renamingId = renaming?.id;
  const nameId = `${id}-name`;

  // The field of a new name takes the focus when it appears, because the menu that opened it is gone.
  useEffect(() => {
    if (renamingId !== undefined) {
      renameField.current?.focus();
      renameField.current?.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (focusNext.current !== null) {
      list.current?.querySelector<HTMLElement>(`[data-view="${String(focusNext.current)}"] button`)?.focus();
      focusNext.current = null;
    }
  });

  // A change that the browser did not store has still been made in the page, so it is reported as a warning.
  // Returns the error of the name, or null when the change was made.
  const report = (fault: BookmarkFault, done: string): string | null => {
    if (fault === null || fault === BOOKMARK_FAULTS.notStored) {
      setRun(fault === null ? { state: "success", text: done } : { state: "warning", text: fault });
      return null;
    }
    setRun(null);
    return fault;
  };

  const save = () => {
    const fault = report(saveBookmark(map, name), `The view was saved as "${name.trim()}".`);
    setNameFault(fault);
    if (fault === null) {
      setName("");
    }
  };

  const endRenaming = (bookmark: number) => {
    focusNext.current = bookmark;
    setRenaming(null);
  };

  const rename = () => {
    if (!renaming) {
      return;
    }
    const fault = report(
      renameBookmark(renaming.id, renaming.name),
      `The saved view is now named "${renaming.name.trim()}".`,
    );
    if (fault === null) {
      endRenaming(renaming.id);
    } else {
      setRenaming({ ...renaming, fault });
    }
  };

  // The focus passes to the saved view that takes the place of the removed one, or else to the field of the name.
  const remove = ({ id: removed, name: removedName }: Bookmark) => {
    const index = bookmarks.findIndex((bookmark) => bookmark.id === removed);
    const next = bookmarks[index + 1] ?? bookmarks[index - 1];
    report(removeBookmark(removed), `The saved view "${removedName}" was removed.`);
    if (next) {
      focusNext.current = next.id;
    } else {
      document.getElementById(nameId)?.focus();
    }
  };

  // In the field of a new name, the Enter key gives the name and does not save the view again.
  const onRenameKey = (event: KeyboardEvent, bookmark: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      rename();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      endRenaming(bookmark);
    }
  };

  return (
    <ToolPane
      id="bookmarks"
      title="Bookmarks"
      runLabel="Save view"
      onRun={save}
      ready={name.trim() !== ""}
      missing={BOOKMARK_FAULTS.noName}
      run={run}
    >
      <FieldTitle field={nameId} title="Name">
        {`The name under which the present view of the map is saved, of at most ${String(NAME_LENGTH)} characters. Lynkeus keeps the saved views in the local storage of this browser and does not send them to the server.`}
      </FieldTitle>
      <input
        className={nameFault ? "usa-input usa-input--error" : "usa-input"}
        id={nameId}
        aria-invalid={nameFault ? true : undefined}
        aria-describedby={describedBy(infoId(nameId), nameFault && `${nameId}-error`)}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setNameFault(null);
        }}
      />
      <FieldError id={`${nameId}-error`}>{nameFault}</FieldError>
      <Section title="Saved views" count={bookmarks.length}>
        {bookmarks.length === 0 ? (
          <EmptyState title="No saved views" text="Enter a name and press Save view to keep the present view." />
        ) : (
          <ul ref={list} className="item-list saved-views" aria-label="Saved views">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="item" data-view={bookmark.id}>
                {renaming?.id === bookmark.id ? (
                  <div className="item-main">
                    <input
                      ref={renameField}
                      className={renaming.fault ? "usa-input usa-input--error" : "usa-input"}
                      aria-label={`New name of ${bookmark.name}`}
                      aria-invalid={renaming.fault ? true : undefined}
                      aria-describedby={describedBy(renaming.fault && `${id}-rename-error`)}
                      value={renaming.name}
                      onChange={(event) => setRenaming({ id: bookmark.id, name: event.target.value, fault: null })}
                      onKeyDown={(event) => onRenameKey(event, bookmark.id)}
                    />
                    <FieldError id={`${id}-rename-error`}>{renaming.fault}</FieldError>
                    <div className="map-links">
                      <button type="button" className="usa-button usa-button--unstyled" onClick={rename}>
                        Rename
                      </button>
                      <button
                        type="button"
                        className="usa-button usa-button--unstyled"
                        onClick={() => endRenaming(bookmark.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="item-main">
                      <p className="item-title">{bookmark.name}</p>
                    </div>
                    <div className="item-actions">
                      <IconButton
                        icon="near_me"
                        label={`Go to ${bookmark.name}`}
                        onClick={() => showBookmark(map, bookmark)}
                      />
                      <MenuButton
                        icon="more_vert"
                        label="More"
                        name={`More commands of ${bookmark.name}`}
                        items={[
                          {
                            label: "Rename",
                            onSelect: () => setRenaming({ id: bookmark.id, name: bookmark.name, fault: null }),
                          },
                          { label: "Remove", onSelect: () => remove(bookmark) },
                        ]}
                      />
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </ToolPane>
  );
}
