import type OlMap from "ol/Map";
import { useSyncExternalStore } from "react";
import { report } from "../shared/messages/messages";

/** Tell whether the browser can show an element over the whole screen. The browsers of some telephones cannot. */
export function canFillScreen(): boolean {
  return document.fullscreenEnabled;
}

function subscribe(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

/**
 * Return the element that fills the screen, or null. The value follows the browser, which itself leaves the
 * full screen when the user presses the Escape key.
 */
export function useFullScreenElement(): Element | null {
  return useSyncExternalStore(subscribe, () => document.fullscreenElement);
}

/**
 * Return the element that the Full screen button shows over the whole screen: the frame that holds the map and
 * the messages of the page or, when the map stands in no such frame, the map itself.
 */
export function mapFrame(map: OlMap): HTMLElement | null {
  const target = map.getTargetElement() as HTMLElement | null;
  const frame = target?.parentElement;
  return frame?.classList.contains("workspace-map") ? frame : target;
}

/**
 * Show the map over the whole screen, or return to the page when an element already fills the screen. The
 * keyboard focus moves to the map, so that the keys of the map work, and returns afterwards to the element that
 * had it.
 */
export function toggleFullScreen(map: OlMap): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  const frame = mapFrame(map);
  if (!frame) {
    return;
  }
  const opener = document.activeElement;
  const onChange = () => {
    if (!document.fullscreenElement) {
      document.removeEventListener("fullscreenchange", onChange);
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    }
  };
  frame.requestFullscreen().then(
    () => {
      document.addEventListener("fullscreenchange", onChange);
      (map.getTargetElement() as HTMLElement | null)?.focus();
    },
    () => report("error", "The browser did not allow the map to fill the screen."),
  );
}
