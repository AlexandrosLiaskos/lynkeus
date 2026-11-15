// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Legend } from "../contents/Legend";
import { useStore } from "../shared/store";
import type { FrameSide, FrameTick } from "./frame";
import { pageName } from "./layout";
import { sheetStore } from "./sheet";

const SIDES: readonly FrameSide[] = ["top", "right", "bottom", "left"];

function tickPlace({ side, at }: FrameTick): CSSProperties {
  const place = `${String(at * 100)}%`;
  return side === "top" || side === "bottom" ? { left: place } : { top: place };
}

/**
 * The page of a layout: the title, the map inside its coordinate frame, the legends, the scale, the projection,
 * the date and the lines of sources. It is a direct child of the body of the document. The style sheet keeps it
 * off the screen and, in a print, shows it alone on a page of the chosen paper size. Assistive technology does
 * not read it, because it repeats what the page shows.
 */
export function LayoutSheet() {
  const sheet = useStore(sheetStore);
  const map = useRef<HTMLDivElement>(null);
  const picture = sheet?.picture ?? null;

  // The picture is the canvas on which the map was drawn, so it is placed in the page as it is.
  useLayoutEffect(() => {
    map.current?.replaceChildren(...(picture ? [picture.canvas] : []));
  }, [picture]);

  if (!sheet) {
    return null;
  }
  const { form, layers, ticks, facts, credits } = sheet;
  const title = form.title.trim();

  return createPortal(
    <div className={`share-sheet share-sheet--${pageName(form.paper, form.orientation)}`} aria-hidden="true">
      {title === "" ? null : <h1 className="share-sheet-title">{title}</h1>}
      <div className={form.frame ? "share-sheet-frame share-sheet-frame--marked" : "share-sheet-frame"}>
        {form.frame
          ? SIDES.map((side) => (
              <div key={side} className={`share-sheet-ticks share-sheet-ticks--${side}`}>
                {ticks
                  .filter((tick) => tick.side === side)
                  .map((tick) => (
                    <span key={`${tick.label} ${String(tick.at)}`} className="share-sheet-tick" style={tickPlace(tick)}>
                      {tick.label}
                    </span>
                  ))}
              </div>
            ))
          : null}
        <div ref={map} className="share-sheet-map" />
      </div>
      <div className="share-sheet-foot">
        {layers.map((layer) => (
          <div key={layer.id} className="share-sheet-legend">
            <p className="share-sheet-legend-title">{layer.title}</p>
            <Legend layer={layer} />
          </div>
        ))}
        <ul className="share-sheet-facts">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <ul className="share-sheet-sources">
          {credits.map((credit) => (
            <li key={credit}>{credit}</li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
