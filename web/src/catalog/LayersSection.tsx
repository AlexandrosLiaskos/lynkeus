import { transformExtent } from "ol/proj";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { loadJobs } from "../data/jobs";
import { zoomTo } from "../data/footprints";
import { LayerFields } from "../data/LayerFields";
import {
  groupLayers,
  LAYER_GROUPINGS,
  LAYER_SORTS,
  layerExtent,
  layersFaultStore,
  layersStore,
  loadLayers,
  removeLayer,
  renameLayer,
  sortLayers,
  unitWords,
  type LayerEntry,
  type LayerGrouping,
  type LayerSort,
} from "../data/layers";
import { formatDay, formatSize } from "../data/products";
import { wordsOf } from "../data/service";
import { Dialog } from "../shared/dialog/Dialog";
import { Info } from "../shared/info/Info";
import { useMap } from "../shared/map";
import { addToMap, mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { keepFocus, openLayerStore } from "./state";

/** The explanation of the section. It shows from the button beside the heading. */
export const ABOUT_LAYERS =
  "The layers of this session: those received from NASA and those computed by the analysis tools. The server keeps the files of a layer until the layer is removed or the session ends. A layer is added to the map from here, and the Contents pane then lists it.";

/** The largest length of the name of a layer, in characters, as the server takes it. */
const MOST_TITLE = 200;

/** State how many layers the session holds, their total size where the server states it, and how many are on the map. */
export function layersSentence(entries: readonly LayerEntry[], onMap: number): string {
  const number = entries.length === 1 ? "1 layer" : `${String(entries.length)} layers`;
  const sized = entries.every((entry) => entry.size !== null);
  const size = sized ? `, ${formatSize(entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0))}` : "";
  const shown =
    onMap === 0 ? "None is on the map." : onMap === 1 ? "1 is on the map." : `${String(onMap)} are on the map.`;
  return `${number}${size}. ${shown}`;
}

interface LayerItemProps {
  entry: LayerEntry;
  open: boolean;
  onMap: boolean;
  onDetails: () => void;
  onRemove: () => void;
}

/**
 * One layer of the list: its name, its quantity with the unit, the dates of its data and its size. A click on
 * the layer shows its tools under it, which are the commands of an item of the Catalog pane of ArcGIS Pro and of
 * the Browser panel of QGIS.
 */
function LayerItem({ entry, open, onMap, onDetails, onRemove }: LayerItemProps) {
  const map = useMap();
  const id = useId();
  const item = useRef<HTMLLIElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const { layer, size } = entry;

  // A layer that is opened from the list of jobs is brought into the visible part of the pane.
  useEffect(() => {
    if (open) {
      item.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const zoom = () => {
    layerExtent(layer)
      .then((extent) => zoomTo(map, transformExtent(extent, "EPSG:4326", map.getView().getProjection())))
      .catch((error: unknown) => report("error", wordsOf(error, "The extent of the layer could not be read.")));
  };

  const rename = (event: SyntheticEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (title === "") {
      setFault("Give the new name of the layer.");
      return;
    }
    if (title === layer.title) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    renameLayer(layer.id, title)
      .then(() => {
        setRenaming(false);
        report("info", `The layer was renamed to "${title}".`);
      })
      .catch((error: unknown) => setFault(wordsOf(error, "The layer could not be renamed.")))
      .finally(() => setBusy(false));
  };

  return (
    <li ref={item} className={open ? "layer layer--open" : "layer"}>
      <button
        type="button"
        className="catalog-item"
        aria-expanded={open}
        aria-controls={`${id}-tools`}
        onClick={() => openLayerStore.set(open ? null : layer.id)}
      >
        <span className="catalog-item-title">{layer.title}</span>
        <span>
          {layer.quantity} ({unitWords(layer.unit)})
        </span>
        <span>
          {[
            layer.dates.map(formatDay).join(" and "),
            size === null ? null : formatSize(size),
            onMap ? "On the map" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      <div id={`${id}-tools`} hidden={!open}>
        {renaming ? (
          <form className="layer-rename" onSubmit={rename} noValidate>
            <label className="usa-label" htmlFor={`${id}-name`}>
              New name of the layer
            </label>
            <input
              className="usa-input"
              id={`${id}-name`}
              value={name}
              maxLength={MOST_TITLE}
              autoComplete="off"
              aria-invalid={fault ? true : undefined}
              aria-describedby={fault ? `${id}-fault` : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {fault ? (
              <p className="usa-error-message" id={`${id}-fault`} role="alert">
                {fault}
              </p>
            ) : null}
            <div className="catalog-tools">
              <button type="submit" className="usa-button" disabled={busy}>
                Rename
              </button>
              <button type="button" className="usa-button usa-button--unstyled" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="catalog-tools layer-tools" role="group" aria-label={`Tools of the layer ${layer.title}`}>
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              onClick={() => (onMap ? removeFromMap(layer.id) : addToMap(layer))}
            >
              {onMap ? "Remove from the map" : "Add to the map"}
            </button>
            <button type="button" className="usa-button usa-button--unstyled" onClick={zoom}>
              Zoom to
            </button>
            <button type="button" className="usa-button usa-button--unstyled" onClick={onDetails}>
              Details
            </button>
            <a className="usa-button usa-button--unstyled" href={layer.url} download>
              Download
            </a>
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              onClick={() => {
                setName(layer.title);
                setFault(null);
                setRenaming(true);
              }}
            >
              Rename
            </button>
            <button type="button" className="usa-button usa-button--unstyled" onClick={onRemove}>
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The section "Layers" of the Catalog pane: the layers of the session, received from NASA and computed by the
 * analysis tools. A layer is added to the map and taken off it, the map moves to it, its description is shown
 * in full, its GeoTIFF file is downloaded, and the layer is renamed or removed. The section is shown while the
 * session has a layer.
 */
export function LayersSection() {
  const id = useId();
  const entries = useStore(layersStore);
  const fault = useStore(layersFaultStore);
  const mapLayers = useStore(mapLayersStore);
  const open = useStore(openLayerStore);
  const [sort, setSort] = useState<LayerSort>("newest");
  const [grouping, setGrouping] = useState<LayerGrouping>("none");
  const [details, setDetails] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  if (entries.length === 0 && fault === null) {
    return null;
  }

  const isOnMap = (entry: LayerEntry) => mapLayers.some((layer) => layer.id === entry.layer.id);
  const described = entries.find((entry) => entry.layer.id === details);
  const toRemove = entries.find((entry) => entry.layer.id === doomed);

  const remove = () => {
    if (!toRemove) {
      return;
    }
    const { id: layer, title } = toRemove.layer;
    setRemoving(true);
    removeLayer(layer)
      .then(() => {
        report("info", `The layer "${title}" was removed.`);
        keepFocus(() => heading.current);
        // The server removes the record of the job that produced the layer.
        void loadJobs();
      })
      .catch((error: unknown) => report("error", wordsOf(error, "The layer could not be removed.")))
      .finally(() => {
        setRemoving(false);
        setAsking(false);
      });
  };

  return (
    <section
      className="catalog-section catalog-layers"
      aria-labelledby={`${id}-heading`}
      aria-describedby={`${id}-info`}
    >
      <div className="catalog-heading">
        <div className="info-title">
          <h3 id={`${id}-heading`} ref={heading} tabIndex={-1}>
            Layers
          </h3>
          <Info id={`${id}-info`} about="Layers">
            {ABOUT_LAYERS}
          </Info>
        </div>
      </div>
      <p className="catalog-summary" role="status">
        {entries.length === 0 ? null : layersSentence(entries, entries.filter(isOnMap).length)}
      </p>
      {fault === null ? null : (
        <p className="usa-error-message catalog-fault" role="alert">
          {fault}{" "}
          <button type="button" className="usa-button usa-button--unstyled" onClick={() => void loadLayers()}>
            Read again
          </button>
        </p>
      )}
      {entries.length === 0 ? null : (
        <>
          <div className="catalog-choices">
            <label htmlFor={`${id}-sort`}>Sort by</label>
            <select
              className="usa-select"
              id={`${id}-sort`}
              value={sort}
              onChange={(event) => setSort(event.target.value as LayerSort)}
            >
              {Object.entries(LAYER_SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-group`}>Group by</label>
            <select
              className="usa-select"
              id={`${id}-group`}
              value={grouping}
              onChange={(event) => setGrouping(event.target.value as LayerGrouping)}
            >
              {Object.entries(LAYER_GROUPINGS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="session-list">
            {groupLayers(sortLayers(entries, sort), grouping, formatDay).map(({ title, layers }) => (
              <div key={title} className="catalog-group">
                {title === "" ? null : (
                  <h4>
                    {title} <span className="catalog-group-count">({layers.length})</span>
                  </h4>
                )}
                <ul className="catalog-list">
                  {layers.map((entry) => (
                    <LayerItem
                      key={entry.layer.id}
                      entry={entry}
                      open={entry.layer.id === open}
                      onMap={isOnMap(entry)}
                      onDetails={() => setDetails(entry.layer.id)}
                      onRemove={() => {
                        setDoomed(entry.layer.id);
                        setAsking(true);
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      {described ? (
        <Dialog title={`Layer: ${described.layer.title}`} open onClose={() => setDetails(null)} large>
          <LayerFields entry={described} />
        </Dialog>
      ) : null}
      <Dialog
        title="Remove the layer"
        open={asking && toRemove !== undefined}
        onClose={() => setAsking(false)}
        footer={
          <ul className="usa-button-group">
            <li className="usa-button-group__item">
              <button type="button" className="usa-button usa-button--secondary" disabled={removing} onClick={remove}>
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
        {toRemove ? (
          <p>
            The layer &quot;{toRemove.layer.title}&quot; and its files are removed from the server
            {isOnMap(toRemove) ? ", and the layer leaves the map" : ""}. This cannot be undone.
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}
