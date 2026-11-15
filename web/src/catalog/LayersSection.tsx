// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { transformExtent } from "ol/proj";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { loadJobs } from "../data/jobs";
import { zoomTo } from "../data/footprints";
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
import { useMap } from "../shared/map";
import { addToMap, mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { MenuButton, type MenuButtonItem } from "../shared/menu/MenuButton";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { PROJECT_SERVER_WORDS, serversStore, type Server } from "../shared/servers";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { Toolbar } from "../shared/toolbar/Toolbar";
import { layerGroups } from "./details";
import { keepFocus, layersOpenStore, markedLayerStore, SECTIONS, titleOf } from "./state";

/** The explanation of the section. It shows from the "i" beside its title. */
export const ABOUT_LAYERS =
  "The layers of this session: those received from NASA and those computed by the analysis tools. The server keeps the files of a layer until the layer is removed or the session ends. A layer is added to the map from here, and the Contents pane then lists it.";

/** The largest length of the name of a layer, in characters, as the server takes it. */
const MOST_TITLE = 200;

/** State the total size of the files of the layers, where the server states it, and how many layers are on the map. */
export function layersSentence(entries: readonly LayerEntry[], onMap: number): string {
  const sized = entries.every((entry) => entry.size !== null);
  const size = sized
    ? `The files take ${formatSize(entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0))}. `
    : "";
  const shown =
    onMap === 0
      ? "No layer is on the map."
      : onMap === 1
        ? "1 layer is on the map."
        : `${String(onMap)} layers are on the map.`;
  return `${size}${shown}`;
}

/**
 * Return the words that say where a layer is kept, or null where the list does not say it: for a layer of the
 * project server of a visitor who has no own server. A layer whose server is not connected is marked.
 */
export function keptWords(entry: LayerEntry, servers: readonly Server[]): string | null {
  if (!entry.server) {
    return servers.length > 0 ? `On the ${PROJECT_SERVER_WORDS.toLowerCase()}` : null;
  }
  const server = servers.find((listed) => listed.id === entry.server?.id);
  return server && !server.connected ? `On ${entry.server.name}, which is not connected` : `On ${entry.server.name}`;
}

/** State from where the removal of a layer takes its files, and what else it does. */
export function removalWords(entry: LayerEntry, onMap: boolean): string {
  const from = entry.server ? `your server "${entry.server.name}"` : "the server";
  return `The layer "${entry.layer.title}" and its files are removed from ${from}${onMap ? ", and the layer leaves the map" : ""}. This cannot be undone.`;
}

/** Ask the browser to save the file of an address. */
function download(address: string): void {
  const link = document.createElement("a");
  link.href = address;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}

interface LayerItemProps {
  entry: LayerEntry;
  /** Where the layer is kept, in words, or null where the list does not say it. */
  kept: string | null;
  marked: boolean;
  onMap: boolean;
  onDetails: () => void;
  onRemove: () => void;
}

/**
 * One layer of the list: its name, its quantity with the unit, and the dates of its data with its size and, for
 * a visitor who has an own server, the server that keeps it. A click
 * marks the layer, as the command Show layer of a job does, and a second click ends the mark. The item shows the
 * one command that fits the state of the layer: Add to the map, or Zoom to for a layer that is on the map. Its
 * other commands stand in the menu "More"; they are the commands of an item of the Catalog pane of ArcGIS Pro
 * and of the Browser panel of QGIS. The layer is renamed in a field that takes the place of its text.
 */
function LayerItem({ entry, kept, marked, onMap, onDetails, onRemove }: LayerItemProps) {
  const map = useMap();
  const id = useId();
  const item = useRef<HTMLLIElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const { layer, size } = entry;

  // A layer that is marked from the list of jobs is brought into the visible part of the pane.
  useEffect(() => {
    if (marked) {
      item.current?.scrollIntoView({ block: "nearest" });
    }
  }, [marked]);

  const zoom = () => {
    layerExtent(layer)
      .then((extent) => zoomTo(map, transformExtent(extent, "EPSG:4326", map.getView().getProjection())))
      .catch((error: unknown) => report("error", wordsOf(error, "The extent of the layer could not be read.")));
  };

  // The field leaves the item, and the keyboard focus returns to the text of the layer.
  const endRenaming = () => {
    setRenaming(false);
    keepFocus(() => item.current?.querySelector<HTMLElement>(".catalog-pick") ?? null);
  };

  const rename = (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const title = name.trim();
    if (title === "") {
      setFault("Give the new name of the layer.");
      return;
    }
    if (title === layer.title) {
      endRenaming();
      return;
    }
    setBusy(true);
    renameLayer(layer.id, title)
      .then(() => {
        endRenaming();
        report("info", `The layer was renamed to "${title}".`);
      })
      .catch((error: unknown) => setFault(wordsOf(error, "The layer could not be renamed.")))
      .finally(() => setBusy(false));
  };

  const more: MenuButtonItem[] = [
    onMap
      ? { label: "Remove from the map", onSelect: () => removeFromMap(layer.id) }
      : { label: "Zoom to", onSelect: zoom },
    { label: "Details", onSelect: onDetails },
    { label: "Download GeoTIFF", onSelect: () => download(layer.url) },
    {
      label: "Rename",
      onSelect: () => {
        setName(layer.title);
        setFault(null);
        setRenaming(true);
      },
    },
    { label: "Remove", onSelect: onRemove, separated: true },
  ];

  return (
    <li ref={item} className={marked ? "item item--selected layer" : "item layer"}>
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
            <button
              type="button"
              className="catalog-pick"
              aria-pressed={marked}
              onClick={() => markedLayerStore.set(marked ? null : layer.id)}
            >
              <span className="item-title">{layer.title}</span>
              <span className="item-line">
                {layer.quantity} ({unitWords(layer.unit)})
              </span>
              <span className="item-line">
                {[
                  layer.dates.map(formatDay).join(" and "),
                  size === null ? null : formatSize(size),
                  onMap ? "On the map" : null,
                  kept,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </div>
          <div
            className="item-actions catalog-actions"
            role="group"
            aria-label={`Commands of the layer ${layer.title}`}
          >
            <button
              type="button"
              className="usa-button usa-button--unstyled"
              onClick={onMap ? zoom : () => addToMap(layer)}
            >
              {onMap ? "Zoom to" : "Add to the map"}
            </button>
            <MenuButton icon="more_vert" label="More" name={`More commands of ${layer.title}`} items={more} />
          </div>
        </>
      )}
    </li>
  );
}

/**
 * The section "Layers" of the Catalog pane: the layers of the session, received from NASA and computed by the
 * analysis tools. A layer is added to the map and taken off it, the map moves to it, its description is shown
 * in full, its GeoTIFF file is downloaded, and the layer is renamed or removed. The commands of the list stand
 * in the header of the section: its order, its groups and a new reading from the server. Without a layer the
 * section says how it fills.
 */
export function LayersSection() {
  const entries = useStore(layersStore);
  const fault = useStore(layersFaultStore);
  const mapLayers = useStore(mapLayersStore);
  const marked = useStore(markedLayerStore);
  const open = useStore(layersOpenStore);
  const servers = useStore(serversStore)?.servers ?? [];
  const [sort, setSort] = useState<LayerSort>("newest");
  const [grouping, setGrouping] = useState<LayerGrouping>("none");
  const [details, setDetails] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isOnMap = (entry: LayerEntry) => mapLayers.some((layer) => layer.id === entry.layer.id);
  const described = entries.find((entry) => entry.layer.id === details);
  const toRemove = entries.find((entry) => entry.layer.id === doomed);
  const read = () => void loadLayers();

  const remove = () => {
    if (!toRemove || removing) {
      return;
    }
    const { id: layer, title } = toRemove.layer;
    setRemoving(true);
    removeLayer(layer)
      .then(() => {
        report("info", `The layer "${title}" was removed.`);
        keepFocus(() => titleOf(SECTIONS.layers));
        // The server removes the record of the job that produced the layer.
        void loadJobs();
      })
      .catch((error: unknown) => report("error", wordsOf(error, "The layer could not be removed.")))
      .finally(() => {
        setRemoving(false);
        setAsking(false);
      });
  };

  const commands =
    entries.length > 0 ? (
      <Toolbar label="Commands of the list of layers">
        <MenuButton
          icon="sort_arrow"
          label="Sort by"
          items={Object.entries(LAYER_SORTS).map(([value, label]) => ({
            label,
            checked: value === sort,
            onSelect: () => setSort(value as LayerSort),
          }))}
        />
        <MenuButton
          icon="folder"
          label="Group by"
          items={Object.entries(LAYER_GROUPINGS).map(([value, label]) => ({
            label,
            checked: value === grouping,
            onSelect: () => setGrouping(value as LayerGrouping),
          }))}
        />
        <IconButton icon="autorenew" label="Read again" onClick={read} />
      </Toolbar>
    ) : fault === null ? undefined : (
      <IconButton icon="autorenew" label="Read again" onClick={read} />
    );

  return (
    <>
      <Section
        id={SECTIONS.layers}
        title="Layers"
        count={entries.length}
        info={ABOUT_LAYERS}
        actions={commands}
        open={open}
        onToggle={(next) => layersOpenStore.set(next)}
      >
        {fault === null ? null : (
          <Notice kind="error" action={{ label: "Read again", onClick: read }}>
            {fault}
          </Notice>
        )}
        {entries.length === 0 ? (
          fault === null ? (
            <p className="catalog-note">A layer is listed when the job that gets or computes it has finished.</p>
          ) : null
        ) : (
          <>
            <p className="catalog-note" role="status">
              {layersSentence(entries, entries.filter(isOnMap).length)}
            </p>
            {groupLayers(sortLayers(entries, sort), grouping, formatDay).map(({ title, layers }) => (
              <div key={title} className="catalog-group">
                {title === "" ? null : (
                  <h4 className="catalog-group-title pane-bleed">
                    {title} <span className="catalog-group-count">({layers.length})</span>
                  </h4>
                )}
                <ul className="item-list item-list--selectable pane-bleed">
                  {layers.map((entry) => (
                    <LayerItem
                      key={entry.layer.id}
                      entry={entry}
                      kept={keptWords(entry, servers)}
                      marked={entry.layer.id === marked}
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
          </>
        )}
      </Section>
      {described ? (
        <Dialog title={`Layer: ${described.layer.title}`} open onClose={() => setDetails(null)} large>
          <PropertyList groups={layerGroups(described, keptWords(described, servers))} />
        </Dialog>
      ) : null}
      <Dialog
        title="Remove the layer"
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
        {toRemove ? <p>{removalWords(toRemove, isOnMap(toRemove))}</p> : null}
      </Dialog>
    </>
  );
}
