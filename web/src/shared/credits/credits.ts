// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import OSM from "ol/source/OSM";
import { useEffect, useState } from "react";

/** Where a credit stands: on the map itself, or beside the map, in the status bar. */
export type CreditPlace = "map" | "beside";

/** The credit of a layer: the attribution that its source gives, which is a piece of HTML, and its place. */
export interface Credit {
  html: string;
  place: CreditPlace;
}

/** A part of a credit: a text, or a link with its text and its address. */
export type CreditPart = string | { text: string; address: string };

/**
 * Return the credits of the layers that the map shows at its present view, each once, in the order of the
 * layers. A layer gives the attributions of its source while it is visible, as the attribution control of
 * OpenLayers reads them.
 *
 * The credit of a layer of OpenStreetMap stands on the map itself. The Tile Usage Policy of
 * tile.openstreetmap.org asks its users to "Show OpenStreetMap licence attribution clearly on the map", and
 * not to hide it under an element of the page, behind a switch or off the screen
 * (https://operations.osmfoundation.org/policies/tiles/, section 2). Every other credit stands beside the map.
 * A source that asks for its credit on the map is named here.
 */
export function creditsOf(map: OlMap): Credit[] {
  const view = map.getView();
  if (!view.isDef()) {
    return [];
  }
  const credits: Credit[] = [];
  for (const layer of map.getAllLayers()) {
    const place: CreditPlace = layer.getSource() instanceof OSM ? "map" : "beside";
    for (const html of layer.getAttributions(view)) {
      if (!credits.some((credit) => credit.html === html && credit.place === place)) {
        credits.push({ html, place });
      }
    }
  }
  return credits;
}

/**
 * Return the parts of a credit. A link of the attribution stays a link when its address starts with
 * `https://`. Everything else is written as its text, so that no other markup of a source reaches the page.
 */
export function creditParts(html: string): CreditPart[] {
  const page = new DOMParser().parseFromString(html, "text/html");
  const parts: CreditPart[] = [];
  for (const node of page.body.childNodes) {
    const text = node.textContent ?? "";
    const address = node.nodeName === "A" ? ((node as Element).getAttribute("href") ?? "") : "";
    if (address.startsWith("https://") && text !== "") {
      parts.push({ text, address });
    } else if (text !== "") {
      parts.push(text);
    }
  }
  return parts;
}

/** Return a list of credits as one text, by which two lists are compared. */
function written(credits: readonly Credit[]): string {
  return credits.map(({ html, place }) => `${place} ${html}`).join("\n");
}

/**
 * Follow the credits of a map: call the listener with the credits at once, and again whenever they change. The
 * credits are read after each drawing of the map, as the attribution control of OpenLayers reads them. The
 * function returned ends the following.
 */
export function watchCredits(map: OlMap, listener: (credits: Credit[]) => void): () => void {
  let shown = creditsOf(map);
  listener(shown);
  const key = map.on("postrender", () => {
    const present = creditsOf(map);
    if (written(present) !== written(shown)) {
      shown = present;
      listener(present);
    }
  });
  return () => unByKey(key);
}

/** Read the credits of a map in a component. The component is drawn again when the credits change. */
export function useCredits(map: OlMap): readonly Credit[] {
  const [credits, setCredits] = useState(() => creditsOf(map));
  useEffect(() => watchCredits(map, setCredits), [map]);
  return credits;
}
