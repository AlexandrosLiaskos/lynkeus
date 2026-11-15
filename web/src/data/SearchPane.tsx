import { useEffect, useId, useState } from "react";
import { areaStore } from "../shared/area";
import { dockStore, openToolPane } from "../shared/dock/dock";
import { Info } from "../shared/info/Info";
import { PRODUCT_TYPES, type ProductType } from "../shared/layer";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { ToolPane, ToolPaneGroup, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { AreaFields, rectangleText } from "./AreaFields";
import { EXPLANATIONS } from "./explanations";
import { FieldTitle, infoId } from "./FieldTitle";
import { daysOfMonth, MONTHS, periodDays, PERIODS, type PeriodId, type SeasonDay } from "./period";
import {
  BANDS,
  BANDWIDTH_PRODUCTS,
  BANDWIDTHS,
  CHANNELS,
  MATURITIES,
  PAIR_PRODUCTS,
  PRODUCT_NAMES,
  SIDE_BAND_PRODUCTS,
  type Bandwidth,
  type Coverage,
  type Direction,
} from "./products";
import { runSearch, stopSearch } from "./run";
import { firstDraft, FRAMES, searchOfDraft, TRACKS, type SearchDraft } from "./search";
import { viewArea } from "./searchArea";
import { GET_LAYER_PANE, productsStore, SEARCH_PANE, searchDraftStore } from "./state";

/** Add a value to a list, or take it out, and keep the order of the offered values. */
function toggled<Value extends string>(offered: readonly Value[], chosen: readonly Value[], value: Value): Value[] {
  return offered.filter((other) => (other === value ? !chosen.includes(value) : chosen.includes(other)));
}

interface ChecksProps<Value extends string> {
  legend: string;
  /** The explanation of the group, in complete sentences. */
  info: string;
  offered: readonly Value[];
  chosen: readonly Value[];
  onChange: (chosen: Value[]) => void;
}

/** A row of check boxes under one name, with the explanation of the name behind the button beside it. */
function Checks<Value extends string>({ legend, info, offered, chosen, onChange }: ChecksProps<Value>) {
  const id = useId();
  return (
    <fieldset
      className="usa-fieldset search-checks"
      aria-labelledby={`${id}-title`}
      aria-describedby={infoId(`${id}-title`)}
    >
      <legend className="usa-legend">
        <span id={`${id}-title`}>{legend}</span>
        <Info id={infoId(`${id}-title`)} about={legend}>
          {info}
        </Info>
      </legend>
      {offered.map((value) => (
        <div className="usa-checkbox" key={value}>
          <input
            className="usa-checkbox__input"
            type="checkbox"
            id={`${id}-${value}`}
            checked={chosen.includes(value)}
            onChange={() => onChange(toggled(offered, chosen, value))}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-${value}`}>
            {value}
          </label>
        </div>
      ))}
    </fieldset>
  );
}

interface SeasonDayFieldsProps {
  legend: string;
  value: SeasonDay;
  onChange: (value: SeasonDay) => void;
}

/** The day and the month of one end of a season. */
function SeasonDayFields({ legend, value, onChange }: SeasonDayFieldsProps) {
  return (
    <fieldset className="usa-fieldset search-season-day">
      <legend className="usa-legend">{legend}</legend>
      <select
        className="usa-select"
        aria-label={`${legend}: day`}
        value={value.day}
        onChange={(event) => onChange({ ...value, day: Number(event.target.value) })}
      >
        {Array.from({ length: daysOfMonth(value.month) }, (_, index) => index + 1).map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>
      <select
        className="usa-select"
        aria-label={`${legend}: month`}
        value={value.month}
        onChange={(event) => {
          const month = Number(event.target.value);
          onChange({ month, day: Math.min(value.day, daysOfMonth(month)) });
        }}
      >
        {MONTHS.map((month, index) => (
          <option key={month} value={index + 1}>
            {month}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

/**
 * Tell whether a group of choices is open. A group opens when one of its choices is made, also by another part
 * of the page. It does not close when the choice is taken back, so that it never closes while the user works in
 * it.
 */
function useOpenWhenUsed(used: boolean): boolean {
  const [open, setOpen] = useState(used);
  if (used && !open) {
    setOpen(true);
  }
  return open;
}

/**
 * The choices of the search. They are kept when the pane closes. The first time that the pane opens, they are
 * the drawn area or, without one, the view of the map, and the last 30 days. The choices that most searches
 * need stand first: what is searched, the product type, the area and the period. The choices of the orbit and of
 * the radar stand in two groups under them, which are closed while none of their choices is made.
 */
function SearchFields() {
  const map = useMap();
  const id = useId();
  const stored = useStore(searchDraftStore);
  const orbitOpen = useOpenWhenUsed(
    stored !== null && [stored.track, stored.frame, stored.direction, stored.cycle, stored.orbit].some(Boolean),
  );
  const radarOpen = useOpenWhenUsed(
    stored !== null &&
      (stored.channels.length > 0 ||
        stored.sideChannels.length > 0 ||
        stored.bands.length > 0 ||
        stored.bandwidth !== "" ||
        stored.coverage !== "" ||
        stored.joint !== ""),
  );

  // The form is first filled when the pane is first opened, so that the area of the search is not on the map
  // before the user has asked for the search.
  const open = useStore(dockStore).tools.includes(SEARCH_PANE);
  useEffect(() => {
    if (open && searchDraftStore.get() === null) {
      searchDraftStore.set(firstDraft(rectangleText(areaStore.get() ?? viewArea(map))));
    }
  }, [map, open]);

  if (!stored) {
    return null;
  }
  const draft = stored;
  const change = (changes: Partial<SearchDraft>) => {
    const current = searchDraftStore.get();
    if (current) {
      searchDraftStore.set({ ...current, ...changes });
    }
  };

  const { product } = draft;
  const isPair = PAIR_PRODUCTS.includes(product);
  const hasSideBand = SIDE_BAND_PRODUCTS.includes(product);
  const hasBandwidth = BANDWIDTH_PRODUCTS.includes(product);

  const maturity = (
    <Checks
      legend="Level of validation"
      info={EXPLANATIONS.maturity}
      offered={MATURITIES}
      chosen={draft.maturity}
      onChange={(chosen) => change({ maturity: chosen })}
    />
  );

  return (
    <>
      <fieldset className="usa-fieldset search-checks">
        <legend className="usa-legend">Search by</legend>
        {(
          [
            ["properties", "Area, period and properties"],
            ["names", "Product names"],
          ] as const
        ).map(([by, label]) => (
          <div className="usa-radio" key={by}>
            <input
              className="usa-radio__input"
              type="radio"
              name={`${id}-by`}
              id={`${id}-by-${by}`}
              checked={draft.by === by}
              onChange={() => change({ by })}
            />
            <label className="usa-radio__label" htmlFor={`${id}-by-${by}`}>
              {label}
            </label>
          </div>
        ))}
      </fieldset>

      {draft.by === "names" ? (
        <>
          <FieldTitle field={`${id}-names`} title="Names">
            {EXPLANATIONS.names}
          </FieldTitle>
          <textarea
            className="usa-textarea search-names"
            id={`${id}-names`}
            aria-describedby={infoId(`${id}-names`)}
            rows={6}
            spellCheck={false}
            value={draft.names}
            onChange={(event) => change({ names: event.target.value })}
          />
          {maturity}
        </>
      ) : (
        <>
          <label className="usa-label" htmlFor={`${id}-product`}>
            Product type
          </label>
          <select
            className="usa-select"
            id={`${id}-product`}
            value={product}
            onChange={(event) => change({ product: event.target.value as ProductType })}
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}: {PRODUCT_NAMES[type]}
              </option>
            ))}
          </select>
          {maturity}

          <AreaFields draft={draft} onChange={change} />

          <FieldTitle field={`${id}-period`} title="Period">
            {EXPLANATIONS.period}
          </FieldTitle>
          <select
            className="usa-select"
            id={`${id}-period`}
            aria-describedby={infoId(`${id}-period`)}
            value={draft.period}
            onChange={(event) => {
              const period = event.target.value as PeriodId;
              change({ period, ...periodDays(period) });
            }}
          >
            {PERIODS.map(({ id: period, label }) => (
              <option key={period} value={period}>
                {label}
              </option>
            ))}
          </select>
          <div className="search-row">
            <div>
              <label className="usa-label" htmlFor={`${id}-start`}>
                First day
              </label>
              <input
                className="usa-input"
                id={`${id}-start`}
                type="date"
                value={draft.start}
                onChange={(event) => change({ period: "custom", start: event.target.value })}
              />
            </div>
            <div>
              <label className="usa-label" htmlFor={`${id}-end`}>
                Last day
              </label>
              <input
                className="usa-input"
                id={`${id}-end`}
                type="date"
                value={draft.end}
                onChange={(event) => change({ period: "custom", end: event.target.value })}
              />
            </div>
          </div>

          <div className="usa-checkbox data-option">
            <input
              className="usa-checkbox__input"
              type="checkbox"
              id={`${id}-season`}
              checked={draft.season !== null}
              onChange={(event) =>
                change({
                  season: event.target.checked ? { start: { month: 6, day: 1 }, end: { month: 8, day: 31 } } : null,
                })
              }
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-season`}>
              Only a season of each year
            </label>
          </div>
          {draft.season ? (
            <div className="search-row">
              <SeasonDayFields
                legend="Season from"
                value={draft.season.start}
                onChange={(start) => change({ season: draft.season && { ...draft.season, start } })}
              />
              <SeasonDayFields
                legend="Season to"
                value={draft.season.end}
                onChange={(end) => change({ season: draft.season && { ...draft.season, end } })}
              />
            </div>
          ) : null}

          {isPair ? (
            <fieldset
              className="usa-fieldset search-checks search-checks--lines"
              aria-labelledby={`${id}-pairs`}
              aria-describedby={infoId(`${id}-pairs`)}
            >
              <legend className="usa-legend">
                <span id={`${id}-pairs`}>Pairs of acquisitions</span>
                <Info id={infoId(`${id}-pairs`)} about="Pairs of acquisitions">
                  {EXPLANATIONS.pairs}
                </Info>
              </legend>
              {(
                [
                  [false, "Overlapping the period"],
                  [true, "Inside the period"],
                ] as const
              ).map(([inside, label]) => (
                <div className="usa-radio" key={String(inside)}>
                  <input
                    className="usa-radio__input"
                    type="radio"
                    name={`${id}-pair`}
                    id={`${id}-pair-${String(inside)}`}
                    checked={draft.pairInside === inside}
                    onChange={() => change({ pairInside: inside })}
                  />
                  <label className="usa-radio__label" htmlFor={`${id}-pair-${String(inside)}`}>
                    {label}
                  </label>
                </div>
              ))}
            </fieldset>
          ) : null}

          <ToolPaneGroup title="Orbit" open={orbitOpen}>
            <div className="search-row">
              <div>
                <FieldTitle field={`${id}-track`} title="Track">
                  {EXPLANATIONS.track}
                </FieldTitle>
                <input
                  className="usa-input"
                  id={`${id}-track`}
                  aria-describedby={infoId(`${id}-track`)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`1 to ${String(TRACKS)}`}
                  value={draft.track}
                  onChange={(event) => change({ track: event.target.value })}
                />
              </div>
              <div>
                <FieldTitle field={`${id}-frame`} title="Frame">
                  {EXPLANATIONS.frame}
                </FieldTitle>
                <input
                  className="usa-input"
                  id={`${id}-frame`}
                  aria-describedby={infoId(`${id}-frame`)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`1 to ${String(FRAMES)}`}
                  value={draft.frame}
                  onChange={(event) => change({ frame: event.target.value })}
                />
              </div>
            </div>
            <label className="usa-label" htmlFor={`${id}-direction`}>
              Direction of the orbit
            </label>
            <select
              className="usa-select"
              id={`${id}-direction`}
              value={draft.direction}
              onChange={(event) => change({ direction: event.target.value as Direction | "" })}
            >
              <option value="">Ascending and descending</option>
              <option value="ascending">Ascending</option>
              <option value="descending">Descending</option>
            </select>
            <div className="search-row">
              <div>
                <FieldTitle field={`${id}-cycle`} title="Cycle">
                  {isPair ? EXPLANATIONS.pairCycle : EXPLANATIONS.cycle}
                </FieldTitle>
                <input
                  className="usa-input"
                  id={`${id}-cycle`}
                  aria-describedby={infoId(`${id}-cycle`)}
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.cycle}
                  onChange={(event) => change({ cycle: event.target.value })}
                />
              </div>
              <div>
                <FieldTitle field={`${id}-orbit`} title="Absolute orbit">
                  {EXPLANATIONS.orbit}
                </FieldTitle>
                <input
                  className="usa-input"
                  id={`${id}-orbit`}
                  aria-describedby={infoId(`${id}-orbit`)}
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.orbit}
                  onChange={(event) => change({ orbit: event.target.value })}
                />
              </div>
            </div>
          </ToolPaneGroup>

          <ToolPaneGroup title="Radar" open={radarOpen}>
            <Checks
              legend={hasSideBand ? "Channels of the main band (A)" : "Channels"}
              info={EXPLANATIONS.channels}
              offered={CHANNELS}
              chosen={draft.channels}
              onChange={(channels) => change({ channels })}
            />
            {hasSideBand ? (
              <>
                <Checks
                  legend="Channels of the side band (B)"
                  info={EXPLANATIONS.sideChannels}
                  offered={CHANNELS}
                  chosen={draft.sideChannels}
                  onChange={(sideChannels) => change({ sideChannels })}
                />
                <Checks
                  legend="Frequency bands"
                  info={EXPLANATIONS.bands}
                  offered={BANDS}
                  chosen={draft.bands}
                  onChange={(bands) => change({ bands })}
                />
              </>
            ) : null}
            {hasBandwidth ? (
              <>
                <label className="usa-label" htmlFor={`${id}-bandwidth`}>
                  Range bandwidth{hasSideBand ? " of the main band" : ""}
                </label>
                <select
                  className="usa-select"
                  id={`${id}-bandwidth`}
                  value={draft.bandwidth}
                  onChange={(event) =>
                    change({ bandwidth: event.target.value === "" ? "" : (Number(event.target.value) as Bandwidth) })
                  }
                >
                  <option value="">Any</option>
                  {BANDWIDTHS.map((bandwidth) => (
                    <option key={bandwidth} value={bandwidth}>
                      {bandwidth} MHz
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label className="usa-label" htmlFor={`${id}-coverage`}>
              Coverage of the frame
            </label>
            <select
              className="usa-select"
              id={`${id}-coverage`}
              value={draft.coverage}
              onChange={(event) => change({ coverage: event.target.value as Coverage | "" })}
            >
              <option value="">Full and partial</option>
              <option value="full">Full</option>
              <option value="partial">Partial</option>
            </select>
            <label className="usa-label" htmlFor={`${id}-joint`}>
              Observed together with the S-band radar
            </label>
            <select
              className="usa-select"
              id={`${id}-joint`}
              value={draft.joint}
              onChange={(event) => change({ joint: event.target.value as SearchDraft["joint"] })}
            >
              <option value="">Yes and no</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </ToolPaneGroup>
        </>
      )}
    </>
  );
}

/**
 * The pane of the button Search products. The search needs no Earthdata account. The foot of the pane states
 * what is wrong with the choices, or how many products were found and that the Catalog pane lists them, with
 * the link to the next step, Get layer. The link Restore defaults, at the left end of the foot, returns the first
 * choices with the view of the map.
 */
export function SearchPane() {
  const map = useMap();
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  // The number of times that the first choices were restored. The fields start again after each, so that the
  // two groups are closed.
  const [restored, setRestored] = useState(0);

  const restore = () => {
    setRun(null);
    searchDraftStore.set(firstDraft(rectangleText(viewArea(map))));
    setRestored(restored + 1);
  };

  const start = () => {
    const draft = searchDraftStore.get();
    if (!draft) {
      return;
    }
    const search = searchOfDraft(draft, productsStore.get()?.search.sort);
    if (typeof search === "string") {
      setRun({ state: "error", text: search });
      return;
    }
    setRun({ state: "running", text: "Searching NASA's catalogue" });
    const next = { label: "Get layer", onClick: () => openToolPane(GET_LAYER_PANE) };
    runSearch(search).then(
      (outcome) => setRun(outcome.state === "success" ? { ...outcome, action: next } : outcome),
      (error: unknown) => {
        // A search that the user stopped leaves no outcome.
        const stopped = error instanceof DOMException && error.name === "AbortError";
        setRun(
          stopped ? null : { state: "error", text: error instanceof Error ? error.message : "The search failed." },
        );
      },
    );
  };

  const cancel = () => {
    stopSearch();
    setRun(null);
  };

  return (
    <ToolPane
      id={SEARCH_PANE}
      title="Search products"
      info={EXPLANATIONS.tool}
      runLabel="Search"
      onRun={start}
      run={run}
      secondary={{ label: "Restore defaults", onClick: restore }}
      onCancel={cancel}
    >
      <SearchFields key={restored} />
    </ToolPane>
  );
}
