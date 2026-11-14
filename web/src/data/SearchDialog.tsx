import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { areaStore } from "../shared/area";
import { Dialog } from "../shared/dialog/Dialog";
import { PRODUCT_TYPES, type ProductType } from "../shared/layer";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { setPaneOpen } from "../shared/panes";
import { useStore } from "../shared/store";
import { findProducts, PRODUCT_NAMES, searchFault, type ProductSearch } from "./products";
import { productsStore, searchDialogStore, selectedProductStore } from "./state";
import { viewArea } from "./viewArea";

/** The number of days before today with which the period starts. */
const FIRST_PERIOD = 30;

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const SIDES = ["west", "south", "east", "north"] as const;
const SIDE_NAMES = { west: "West", south: "South", east: "East", north: "North" } as const;

/**
 * The form of the search. It starts with the drawn area or, without one, with the view of the map, and with the
 * last 30 days.
 */
function SearchForm({ onDone }: { onDone: () => void }) {
  const map = useMap();
  const id = useId();
  const request = useRef<AbortController | null>(null);
  const [product, setProduct] = useState<ProductType>("GCOV");
  const [sides, setSides] = useState(() => {
    const area = areaStore.get() ?? viewArea(map);
    return { west: String(area.west), south: String(area.south), east: String(area.east), north: String(area.north) };
  });
  const [period, setPeriod] = useState(() => {
    const today = new Date();
    return { start: day(new Date(today.getTime() - FIRST_PERIOD * 24 * 60 * 60 * 1000)), end: day(today) };
  });
  const [searching, setSearching] = useState(false);
  const [fault, setFault] = useState<string | null>(null);

  // A search that is still running when the dialog closes is abandoned.
  useEffect(() => () => request.current?.abort(), []);

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const side = (name: (typeof SIDES)[number]) => (sides[name].trim() === "" ? Number.NaN : Number(sides[name]));
    const search: ProductSearch = {
      product,
      area: { west: side("west"), south: side("south"), east: side("east"), north: side("north") },
      ...period,
    };
    const wrong = searchFault(search);
    setFault(wrong);
    if (wrong) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    findProducts(search, controller.signal)
      .then((answer) => {
        selectedProductStore.set(null);
        productsStore.set({ search, answer });
        setPaneOpen("catalog", true);
        const listed = answer.products.length;
        if (answer.found === 0) {
          report("info", "No product was found for this type, area and period.");
        } else if (answer.found > listed) {
          report(
            "warning",
            `${String(answer.found)} products were found, and the latest ${String(listed)} are listed. Choose a smaller area or a shorter period to see the others.`,
          );
        } else {
          report("success", listed === 1 ? "1 product was found." : `${String(listed)} products were found.`);
        }
        onDone();
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSearching(false);
          setFault(error instanceof Error ? error.message : "The search failed.");
        }
      });
  };

  return (
    <form className="usa-form search-form" onSubmit={onSubmit} noValidate>
      <label className="usa-label" htmlFor={`${id}-product`}>
        Product type
      </label>
      <select
        className="usa-select"
        id={`${id}-product`}
        value={product}
        onChange={(event) => setProduct(event.target.value as ProductType)}
      >
        {PRODUCT_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}: {PRODUCT_NAMES[type]}
          </option>
        ))}
      </select>

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Area</legend>
        <span className="usa-hint">
          In degrees of longitude and latitude. It starts as the drawn area or, without one, as the view of the map.
        </span>
        <div className="search-form-row search-form-row--four">
          {SIDES.map((name) => (
            <div key={name}>
              <label className="usa-label" htmlFor={`${id}-${name}`}>
                {SIDE_NAMES[name]}
              </label>
              <input
                className="usa-input"
                id={`${id}-${name}`}
                inputMode="decimal"
                value={sides[name]}
                onChange={(event) => setSides({ ...sides, [name]: event.target.value })}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Period</legend>
        <span className="usa-hint">Days in Coordinated Universal Time.</span>
        <div className="search-form-row">
          <div>
            <label className="usa-label" htmlFor={`${id}-start`}>
              First day
            </label>
            <input
              className="usa-input"
              id={`${id}-start`}
              type="date"
              value={period.start}
              onChange={(event) => setPeriod({ ...period, start: event.target.value })}
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
              value={period.end}
              onChange={(event) => setPeriod({ ...period, end: event.target.value })}
            />
          </div>
        </div>
      </fieldset>

      {fault ? (
        <p className="usa-error-message" role="alert">
          {fault}
        </p>
      ) : null}

      <div className="usa-modal__footer">
        <ul className="usa-button-group">
          <li className="usa-button-group__item">
            <button type="submit" className="usa-button" disabled={searching}>
              {searching ? "Searching" : "Search"}
            </button>
          </li>
          <li className="usa-button-group__item">
            <button type="button" className="usa-button usa-button--unstyled" onClick={onDone}>
              Cancel
            </button>
          </li>
        </ul>
      </div>
    </form>
  );
}

/** The dialog of the button Search products. The search needs no Earthdata account. */
export function SearchDialog() {
  const open = useStore(searchDialogStore);
  const close = () => searchDialogStore.set(false);
  return (
    <Dialog title="Search NISAR products" open={open} onClose={close}>
      {open ? <SearchForm onDone={close} /> : null}
    </Dialog>
  );
}
