import { BASE_MAPS, baseMapStore, type BaseMapId } from "../map/baseMaps";
import { MAP_TAB } from "../map/tab";
import { useStore } from "../shared/store";

/** Return the name of a background map: the label of its button on the Map tab. */
function nameOf(id: BaseMapId): string {
  const tools = MAP_TAB.groups.flatMap((group): readonly { id: string; label: string }[] => group.tools);
  return tools.find((tool) => tool.id === id || tool.id.startsWith(`${id}-`))?.label ?? id;
}

/**
 * The background maps, under the layers. One background map is shown at a time, below every layer. The box of a
 * background map shows it in place of the one shown, and the box of the one shown hides it. The boxes and the
 * buttons of the Map tab read and set the same store.
 */
export function BackgroundMaps() {
  const shown = useStore(baseMapStore);
  return (
    <ul className="contents-list" aria-label="Background maps">
      {BASE_MAPS.map(({ id }) => (
        <li key={id} className="contents-background">
          <label>
            <span className="contents-visible">
              <input
                type="checkbox"
                checked={shown === id}
                onChange={(event) => baseMapStore.set(event.target.checked ? id : null)}
              />
            </span>
            {nameOf(id)}
          </label>
        </li>
      ))}
    </ul>
  );
}
