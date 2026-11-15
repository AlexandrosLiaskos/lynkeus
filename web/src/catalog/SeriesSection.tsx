// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useRef, useState, type SyntheticEvent } from "react";
import { loadJobs } from "../data/jobs";
import { unitWords } from "../data/layers";
import { formatDay } from "../data/products";
import {
  extendSeries,
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
import { useLimits } from "../header/notice/limits";
import { Dialog } from "../shared/dialog/Dialog";
import { Icon } from "../shared/icon/Icon";
import { MenuButton, type MenuButtonItem } from "../shared/menu/MenuButton";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { Section } from "../shared/section/Section";
import type { SeriesDescription } from "../shared/series";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { extendedWords, isNear, keepLabel, NEAR_WORDS, seriesUntilWords, useNow } from "./keeping";
import { keepFocus, SECTIONS, titleOf } from "./state";

/** The explanation of the section. It shows from the "i" beside its title. */
export const ABOUT_SERIES_LIST =
  "The series of your Earthdata account, which the Series tools of the Analysis tab compute. A series holds the values of many dates, at a point or for the area of its layers. The project server keeps a series until the date that the series states, or until you remove it.";

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
    series.point ? "At a point" : "Whole area",
  ].join(" · ");
}

/** State what the removal of a series does. */
export function seriesRemovalWords(series: SeriesDescription): string {
  return `The series "${series.title}" is removed from the server. This cannot be undone.`;
}

interface SeriesRowProps {
  item: SeriesItem;
  /** Whether the project server removes the series within the days of the warning. */
  near: boolean;
  /** The name of the command that keeps the series for the keeping time from now. */
  keep: string;
  shown: boolean;
  onRemove: () => void;
}

/**
 * One series of the list: its name, its quantity with the unit, and the number of its dates with its period,
 * its place and the date until which the project server keeps it. A series that is removed within the days of
 * the warning says so. The item shows the command Show, which opens the series in the pane Series; the command
 * that keeps the series longer, Rename and Remove stand in the menu "More". The series is renamed in a field that takes the place of its text, as a layer is.
 */
function SeriesRow({ item, near, keep, shown, onRemove }: SeriesRowProps) {
  const id = useId();
  const row = useRef<HTMLLIElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const { series } = item;
  const until = seriesUntilWords(item);

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

  const extend = () => {
    extendSeries(series.id)
      .then((extended) => report("info", extendedWords("series", extended.series.title, extended.kept_until)))
      .catch((error: unknown) => report("error", wordsOf(error, "The series could not be kept longer.")));
  };

  const more: MenuButtonItem[] = [
    { label: keep, onSelect: extend },
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
              <span className="item-line">
                {[seriesLine(series), near ? null : until].filter(Boolean).join(" · ")}
                {near && until !== null ? (
                  <>
                    {" · "}
                    <span className="catalog-near">
                      <Icon name="warning" />
                      {until}, {NEAR_WORDS}
                    </span>
                  </>
                ) : null}
              </span>
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
 * The section "Series" of the Catalog pane: the series of the account, which the Series tools compute. A
 * series is shown in the pane Series, renamed or removed. It is built with the blocks of the section "Layers":
 * the section, the list of items, the menu "More", the field that renames and the dialog that confirms a
 * removal. Without a series the section says how it fills.
 */
export function SeriesSection() {
  const items = useStore(seriesStore);
  const fault = useStore(seriesFaultStore);
  const shown = useStore(shownSeriesStore);
  // The command that keeps a series longer names the keeping time, which the limits of the server state.
  const limits = useLimits(items.length > 0);
  const now = useNow();
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
                near={isNear(item.kept_until, now)}
                keep={keepLabel(limits)}
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
