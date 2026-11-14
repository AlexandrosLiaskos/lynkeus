import { useId, useState, type KeyboardEvent } from "react";
import { Icon } from "../shared/icon/Icon";
import { Info } from "../shared/info/Info";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import {
  BOOKMARK_FAULTS,
  bookmarksStore,
  removeBookmark,
  renameBookmark,
  saveBookmark,
  showBookmark,
  type Bookmark,
} from "./bookmarks";

/**
 * The pane of the button Bookmarks: a name under which the view is saved, and the list of the saved views. A
 * click on a name returns the map to that view; each bookmark can be renamed and removed.
 */
export function BookmarksPane() {
  const map = useMap();
  const id = useId();
  const bookmarks = useStore(bookmarksStore);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [run, setRun] = useState<ToolPaneRun | null>(null);

  // A change that the browser did not store has still been made in the page, so it is reported as a warning.
  const report = (fault: string | null, done: string) => {
    if (fault === null) {
      setRun({ state: "success", text: done });
    } else {
      setRun({ state: fault === BOOKMARK_FAULTS.notStored ? "warning" : "error", text: fault });
    }
    return fault === null || fault === BOOKMARK_FAULTS.notStored;
  };

  const save = () => {
    if (report(saveBookmark(map, name), `The view was saved as "${name.trim()}".`)) {
      setName("");
    }
  };

  const rename = () => {
    if (
      renaming &&
      report(renameBookmark(renaming.id, renaming.name), `The bookmark is now "${renaming.name.trim()}".`)
    ) {
      setRenaming(null);
    }
  };

  const remove = ({ id: removed, name: removedName }: Bookmark) => {
    report(removeBookmark(removed), `The bookmark "${removedName}" was removed.`);
  };

  // In the field of a new name, the Enter key gives the name and does not save the view again.
  const onRenameKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      rename();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setRenaming(null);
    }
  };

  return (
    <ToolPane id="bookmarks" title="Bookmarks" runLabel="Save view" onRun={save} run={run}>
      <div className="info-title">
        <label className="usa-label" htmlFor={`${id}-name`}>
          Name of the view
        </label>
        <Info id={`${id}-hint`} about="Name of the view">
          The name under which the present view of the map is saved, for example Merrimack River. Lynkeus keeps the
          bookmarks in the local storage of this browser and does not send them to the server.
        </Info>
      </div>
      <input
        className="usa-input"
        id={`${id}-name`}
        aria-describedby={`${id}-hint`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <h3 className="map-pane-heading" id={`${id}-list`}>
        Saved views
      </h3>
      {bookmarks.length === 0 ? <p className="usa-hint">No view is saved.</p> : null}
      <ul className="bookmark-list" aria-labelledby={`${id}-list`}>
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="bookmark">
            {renaming?.id === bookmark.id ? (
              <>
                <input
                  className="usa-input"
                  aria-label={`New name of ${bookmark.name}`}
                  value={renaming.name}
                  onChange={(event) => setRenaming({ id: bookmark.id, name: event.target.value })}
                  onKeyDown={onRenameKey}
                />
                <button type="button" className="usa-button usa-button--unstyled" onClick={rename}>
                  Rename
                </button>
                <button type="button" className="usa-button usa-button--unstyled" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="usa-button usa-button--unstyled bookmark-name"
                  onClick={() => showBookmark(map, bookmark)}
                >
                  {bookmark.name}
                </button>
                <button
                  type="button"
                  className="bookmark-action"
                  aria-label={`Rename ${bookmark.name}`}
                  onClick={() => setRenaming({ id: bookmark.id, name: bookmark.name })}
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="bookmark-action"
                  aria-label={`Remove ${bookmark.name}`}
                  onClick={() => remove(bookmark)}
                >
                  <Icon name="delete" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </ToolPane>
  );
}
