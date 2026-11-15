// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import MapBrowserEvent from "ol/MapBrowserEvent";
import type Interaction from "ol/interaction/Interaction";

/**
 * Press a key on an element of the page and give the event to an interaction, as the map does while it has the
 * keyboard focus. Returns whether the interaction passed the event on and whether it stopped the browser's own
 * action. The tests use it, because the simulated browser draws no map.
 */
export function pressKey(
  interaction: Interaction,
  key: string,
  init: KeyboardEventInit = {},
  element: HTMLElement = document.createElement("div"),
): { passedOn: boolean; prevented: boolean } {
  const map = new OlMap({});
  let passedOn = true;
  const listener = (event: Event) => {
    passedOn = interaction.handleEvent(new MapBrowserEvent("keydown", map, event as KeyboardEvent));
  };
  document.body.append(element);
  element.addEventListener("keydown", listener);
  const event = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  element.dispatchEvent(event);
  element.removeEventListener("keydown", listener);
  element.remove();
  return { passedOn, prevented: event.defaultPrevented };
}
