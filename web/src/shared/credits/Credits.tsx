import { Fragment } from "react";
import { useMap } from "../map";
import { creditParts, useCredits, type CreditPlace } from "./credits";

/**
 * The credits of the layers that the map shows, for one place. The place "map" holds the credits that must stand
 * on the map itself, in its lower right corner. The place "beside" holds the other credits, which stand in the
 * status bar. Nothing is drawn while the place has no credit. A link opens in a new tab of the browser, so that
 * the page keeps its map.
 */
export function Credits({ place }: { place: CreditPlace }) {
  const credits = useCredits(useMap()).filter((credit) => credit.place === place);
  if (credits.length === 0) {
    return null;
  }
  return (
    <p className={`credits credits--${place}`}>
      {credits.map(({ html }, index) => (
        <Fragment key={html}>
          {index > 0 && " "}
          <span className="credit">
            {creditParts(html).map((part, at) =>
              typeof part === "string" ? (
                part
              ) : (
                <a key={at} href={part.address} target="_blank" rel="noopener">
                  {part.text}
                </a>
              ),
            )}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
