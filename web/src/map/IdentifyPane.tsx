import { useStore } from "../shared/store";
import { ToolPane } from "../shared/toolpane/ToolPane";
import { formatAngle } from "./coordinates";
import { formatDate, formatValue, identifyStore } from "./identify";

/**
 * The pane of the Identify button, after the pop-up of ArcGIS Pro: the coordinates of the identified place and,
 * for every visible layer, its name, its quantity with the value and the unit, and its date. The result stays
 * until it is cleared or another place is identified.
 */
export function IdentifyPane() {
  const found = useStore(identifyStore);

  return (
    <ToolPane
      id="identify"
      title="Identify"
      runLabel="Clear"
      onRun={() => identifyStore.set(null)}
      ready={found !== null}
    >
      {found ? (
        <>
          <h3 className="map-pane-heading">Place</h3>
          <dl className="identify-values">
            <dt>Latitude</dt>
            <dd>{formatAngle(found.place[1], "latitude")}</dd>
            <dt>Longitude</dt>
            <dd>{formatAngle(found.place[0], "longitude")}</dd>
          </dl>
          {found.layers.length === 0 ? <p className="usa-hint">The map shows no layer at this place.</p> : null}
          {found.layers.map(({ id, title, quantity, unit, dates, value }) => (
            <section key={id} aria-label={title}>
              <h3 className="map-pane-heading">{title}</h3>
              <dl className="identify-values">
                <dt>{quantity}</dt>
                <dd>{value === null ? "No data at this place" : `${formatValue(value)} ${unit}`}</dd>
                <dt>{dates.length === 1 ? "Date" : "Dates"}</dt>
                <dd>{dates.map(formatDate).join(" and ")}</dd>
              </dl>
            </section>
          ))}
        </>
      ) : (
        <p className="usa-hint">
          Click a place on the map. With the keyboard focus on the map, the Enter key identifies the place under the
          cross in its centre.
        </p>
      )}
    </ToolPane>
  );
}
