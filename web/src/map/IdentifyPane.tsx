import { EmptyState } from "../shared/empty/EmptyState";
import { PropertyList, type PropertyGroup } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ToolPane } from "../shared/toolpane/ToolPane";
import { formatAngle } from "./coordinates";
import { formatDate } from "./day";
import { formatValue, identifyStore, type IdentifiedLayer } from "./identify";

/**
 * Return one group of rows for each layer, under the title of the layer: its quantity with the value and the
 * unit, and its date. A further layer of the same title takes a number after the title, because the titles of
 * the groups of a property list differ.
 */
export function layerGroups(layers: readonly IdentifiedLayer[]): PropertyGroup[] {
  const seen = new Map<string, number>();
  return layers.map(({ title, quantity, unit, dates, value }) => {
    const count = (seen.get(title) ?? 0) + 1;
    seen.set(title, count);
    return {
      title: count === 1 ? title : `${title} (${String(count)})`,
      rows: [
        value === null
          ? { name: quantity, value: "No data at this place" }
          : { name: quantity, value: [formatValue(value), unit].join(" ").trim(), copy: true },
        { name: dates.length === 1 ? "Date" : "Dates", value: dates.map(formatDate).join(" and ") },
      ],
    };
  });
}

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
      runLabel="Clear result"
      onRun={() => identifyStore.set(null)}
      ready={found !== null}
      missing="There is no result to clear."
      info="A click on the map reads the coordinates of the place and the value of every visible layer there. With the keyboard focus on the map, the Enter key reads the place under the cross in the centre of the map. The result stays until it is cleared or another place is identified."
    >
      {found ? (
        <>
          <Section title="Place">
            <PropertyList
              groups={[
                {
                  rows: [
                    { name: "Latitude", value: formatAngle(found.place[1], "latitude"), copy: true },
                    { name: "Longitude", value: formatAngle(found.place[0], "longitude"), copy: true },
                  ],
                },
              ]}
            />
          </Section>
          <Section title="Layers" count={found.layers.length}>
            {found.layers.length === 0 ? (
              <EmptyState
                title="No visible layer"
                text="Show a layer in the Contents pane, or get one from the Catalog pane."
              />
            ) : (
              <PropertyList groups={layerGroups(found.layers)} />
            )}
          </Section>
        </>
      ) : (
        <EmptyState title="No place identified" text="Click a place on the map." />
      )}
    </ToolPane>
  );
}
