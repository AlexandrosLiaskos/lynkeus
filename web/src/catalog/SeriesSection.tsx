// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useRef, useState, type SyntheticEvent } from "react";
import { loadJobs } from "../data/jobs";
import { unitWords } from "../data/layers";
import { formatDay } from "../data/products";
import {
  loadSeries,
  removeSeries,
  renameSeries,
  seriesFaultStore,
  seriesStore,
  showSeries,
  shownSeriesStore,
  type SeriesItem,
} from "../data/series";
import { wordsOf } from "../data/service";
import { Dialog } from "../shared/dialog/Dialog";
import { MenuButton, type MenuButtonItem } from "../shared/menu/MenuButton";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { Section } from "../shared/section/Section";
import type { SeriesDescription } from "../shared/series";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { keepFocus, SECTIONS, titleOf } from "./state";

/** The explanation of the section. It shows from the "i" beside its title. */
export const ABOUT_SERIES_LIST =
  "The series of this session, which the Series tools of the Analysis tab compute. A series holds the values of many dates, at a point or for the area of its layers. The server keeps a series until it is removed or the session ends.";

/** The largest length of the name of a series, in characters, as the server takes it. */
const MOST_TITLE = 200;

/** State what a series holds: the number of its dates or pairs, its first and its last date, and its place. */
export function seriesLine(series: SeriesDescription): string {
  const pairs = series.entries.some((entry) => entry.dates.length > 1);
  const count = series.entries.length;
  const first = series.entries[0]?.dates[0] ?? "";
  const last = series.entries.at(-1)?.dates.at(-1) ?? "";
  return [
    `${String(count)} ${pairs ? "pairs" : "dates"}`,
    `${formatDay(first)} to ${formatDay(last)}`,
    series.point ? "At a point" : series.shape ? "Drawn area" : "Whole area",
  ].join(" · ");
}

/** State what the removal of a series does. */
export function seriesRemovalWords(series: SeriesDescription): string {
  return `The series "${series.title}" is removed from the server. This cannot be undone.`;
}

interface SeriesRowProps {
  item: SeriesItem;
  shown: boolean;
  onRemove: () => void;
}

/**
 * One series of the list: its name, its quantity with the unit, and the number of its dates with its period
 * and its place. The item shows the command Show, which opens the series in the pane Series; Rename and Remove
 * stand in the menu "More". The series is renamed in a field that takes the place of its text, as a layer is.
 */
function SeriesRow({ item, shown, onRemove }: SeriesRowProps) {
  const id = useId();
  const row = useRef<HTMLLIElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const { series } = item;

  // The field leaves the item, and the keyboard focus returns to the text of the series.
  const endRenaming = () => {
    setRenaming(false);
    keepFocus(() => row.current?.querySelector<HTMLElement>(".catalog-pick") ?? null);
  };

  const rename = (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const title = name.trim();
    if (title === "") {
      setFault("Give the new name of the series.");
      return;
    }
    if (title === series.title) {
      endRenaming();
      return;
    }
    setBusy(true);
    renameSeries(series.id, title)
      .then(() => {
        endRenaming();
        report("info", `The series was renamed to "${title}".`);
      })
      .catch((error: unknown) => setFault(wordsOf(error, "The series could not be renamed.")))
      .finally(() => setBusy(false));
  };

  const more: MenuButtonItem[] = [
    {
      label: "Rename",
      onSelect: () => {
        setName(series.title);
        setFault(null);
        setRenaming(true);
      },
    },
    { label: "Remove", onSelect: onRemove, separated: true },
  ];

  return (
    <li ref={row} className={shown ? "item item--selected layer" : "item layer"}>
      {renaming ? (
        <form className="item-main layer-rename" onSubmit={rename} noValidate>
          <label className="usa-label" htmlFor={`${id}-name`}>
            New name
          </label>
          <input
            className="usa-input"
            id={`${id}-name`}
            value={name}
            maxLength={MOST_TITLE}
            autoComplete="off"
            autoFocus
            aria-invalid={fault ? true : undefined}
            aria-describedby={fault ? `${id}-fault` : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {fault ? (
            <p className="usa-error-message" id={`${id}-fault`} role="alert">
              {fault}
            </p>
          ) : null}
          <div className="layer-rename-buttons">
            <button type="submit" className="usa-button usa-button--outline" aria-disabled={busy ? true : undefined}>
              Rename
            </button>
            <button type="button" className="usa-button usa-button--unstyled" onClick={endRenaming}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="item-main">
            <button type="button" className="catalog-pick" aria-pressed={shown} onClick={() => showSeries(series.id)}>
              <span className="item-title">{series.title}</span>
              <span className="item-line">
                {series.quantity} ({unitWords(series.unit)})
              </span>
              <span className="item-line">{seriesLine(series)}</span>
            </button>
          </div>
          <div
            className="item-actions catalog-actions"
            role="group"
            aria-label={`Commands of the series ${series.title}`}
          >
            <button type="button" className="usa-button usa-button--unstyled" onClick={() => showSeries(series.id)}>
              Show
            </button>
            <MenuButton icon="more_vert" label="More" name={`More commands of ${series.title}`} items={more} />
          </div>
        </>
      )}
    </li>
  );
}

/**
 * The section "Series" of the Catalog pane: the series of the session, which the Series tools compute. A
 * series is shown in the pane Series, renamed or removed. It is built with the blocks of the section "Layers":
 * the section, the list of items, the menu "More", the field that renames and the dialog that confirms a
 * removal. Without a series the section says how it fills.
 */
export function SeriesSection() {
  const items = useStore(seriesStore);
  const fault = useStore(seriesFaultStore);
  const shown = useStore(shownSeriesStore);
  const [doomed, setDoomed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  const toRemove = items.find((item) => item.series.id === doomed);
  const read = () => void loadSeries();

  const remove = () => {
    if (!toRemove || removing) {
      return;
    }
    const { id, title } = toRemove.series;
    setRemoving(true);
    removeSeries(id)
      .then(() => {
        report("info", `The series "${title}" was removed.`);
        keepFocus(() => titleOf(SECTIONS.series));
        // The server removes the record of the job that produced the series.
        void loadJobs();
      })
      .catch((error: unknown) => report("error", wordsOf(error, "The series could not be removed.")))
      .finally(() => {
        setRemoving(false);
        setAsking(false);
      });
  };

  return (
    <>
      <Section
        id={SECTIONS.series}
        title="Series"
        count={items.length}
        info={ABOUT_SERIES_LIST}
        actions={
          items.length > 0 || fault !== null ? (
            <IconButton icon="autorenew" label="Read again" onClick={read} />
          ) : undefined
        }
      >
        {fault === null ? null : (
          <Notice kind="error" action={{ label: "Read again", onClick: read }}>
            {fault}
          </Notice>
        )}
        {items.length === 0 ? (
          fault === null ? (
            <p className="catalog-note">A series is listed when the job of a Series tool has finished.</p>
          ) : null
        ) : (
          <ul className="item-list item-list--selectable pane-bleed">
            {items.map((item) => (
              <SeriesRow
                key={item.series.id}
                item={item}
                shown={item.series.id === shown}
                onRemove={() => {
                  setDoomed(item.series.id);
                  setAsking(true);
                }}
              />
            ))}
          </ul>
        )}
      </Section>
      <Dialog
        title="Remove the series"
        open={asking && toRemove !== undefined}
        onClose={() => setAsking(false)}
        footer={
          <ul className="usa-button-group">
            <li className="usa-button-group__item">
              <button
                type="button"
                className="usa-button usa-button--secondary"
                aria-disabled={removing ? true : undefined}
                onClick={remove}
              >
                Remove
              </button>
            </li>
            <li className="usa-button-group__item">
              <button type="button" className="usa-button usa-button--unstyled" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </li>
          </ul>
        }
      >
        {toRemove ? <p>{seriesRemovalWords(toRemove.series)}</p> : null}
      </Dialog>
    </>
  );
}
