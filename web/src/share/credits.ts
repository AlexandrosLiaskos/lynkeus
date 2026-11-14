import type { FrameState } from "ol/Map";
import { createEmpty } from "ol/extent";
import Layer, { inView } from "ol/layer/Layer";

/**
 * The line of sources that a service asks for on a picture of its map, by the id of the layer. A picture has no
 * links, so each line is complete as text.
 *
 * - Blue Marble and the imagery of a date: the acknowledgement that NASA's Global Imagery Browse Services ask their users to add, word for
 *   word (https://nasa-gibs.github.io/gibs-api-docs/).
 * - OpenStreetMap: the attribution guidelines of the OpenStreetMap Foundation ask that the address
 *   openstreetmap.org/copyright is printed where a link is not possible
 *   (https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
 */
const GIBS =
  "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), " +
  "part of NASA's Earth Science Data and Information System (ESDIS).";
const PICTURE_CREDITS: Readonly<Partial<Record<string, string>>> = {
  "blue-marble": GIBS,
  openstreetmap: "\u00a9 OpenStreetMap contributors, openstreetmap.org/copyright",
};

/**
 * The layers whose images come from NASA GIBS and name their own day and instrument. Such a layer gives the
 * attribution of its source first, and then the acknowledgement of GIBS.
 */
const GIBS_LAYERS: readonly string[] = ["imagery"];

/**
 * Return an attribution of OpenLayers as plain text. An attribution is a piece of HTML. A link becomes its text
 * followed by its address in brackets, because a picture cannot hold a link.
 */
export function attributionText(html: string): string {
  const page = new DOMParser().parseFromString(html, "text/html");
  for (const link of page.querySelectorAll("a[href]")) {
    const address = link.getAttribute("href") ?? "";
    link.replaceWith(link.textContent === address ? address : `${link.textContent} (${address})`);
  }
  return page.body.textContent.replace(/\s+/g, " ").trim();
}

/**
 * Return the lines of sources of the layers that a frame of the map has drawn, from the lowest layer to the
 * highest, each line once. A layer with a known service gives the line that the service asks for, and any other
 * layer gives the attributions of its source.
 */
export function creditsOf(frameState: FrameState): string[] {
  const credits: string[] = [];
  const frame = { viewState: frameState.viewState, extent: frameState.extent ?? createEmpty() };
  const states = [...frameState.layerStatesArray].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const state of states) {
    if (!inView(state, frameState.viewState)) {
      continue;
    }
    const id: unknown = state.layer.get("id");
    const fixed = typeof id === "string" ? PICTURE_CREDITS[id] : undefined;
    if (fixed !== undefined) {
      credits.push(fixed);
    } else if (state.layer instanceof Layer) {
      const given = state.layer.getSource()?.getAttributions()?.(frame) ?? [];
      credits.push(...(typeof given === "string" ? [given] : given).map(attributionText));
      if (typeof id === "string" && GIBS_LAYERS.includes(id)) {
        credits.push(GIBS);
      }
    }
  }
  return [...new Set(credits.filter((credit) => credit !== ""))];
}
