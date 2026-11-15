// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import View from "ol/View";
import { creditsOf } from "./credits";
import type { PictureView } from "./frame";

/** A drawn picture of the map. */
export interface Picture {
  canvas: HTMLCanvasElement;
  view: PictureView;
  /** The lines of sources of the layers in the picture. */
  credits: readonly string[];
}

/** How the map is drawn for a picture of a given size. */
export interface PictureGeometry {
  /** Resolution of the view while the map is drawn, in units of the projection for each pixel of the picture. */
  resolution: number;
  /** How many times finer the picture is than the map on the screen. 1 is the map as the screen shows it. */
  scaling: number;
}

/** The longest time that the drawing of a picture may take, in milliseconds. */
export const DRAWING_TIME = 120_000;

/**
 * Return how the map is drawn for a picture of a given size in pixels. The size of the map on the screen is
 * counted in whole pixels of the style sheet, of which an inch holds 96. The picture keeps the centre of the map, and
 * its scale is chosen so that the picture is filled by what the map shows. When the proportions of the picture
 * differ from those of the map, the picture shows less at two opposite sides and nothing beyond the map, as the
 * export of a map does in ArcGIS Pro. A picture of the size of the map is drawn at the resolution of the screen.
 */
export function pictureGeometry(
  screen: { size: readonly [number, number]; resolution: number },
  picture: readonly [number, number],
): PictureGeometry {
  const scaling = Math.max(picture[0] / Math.round(screen.size[0]), picture[1] / Math.round(screen.size[1]));
  return { resolution: screen.resolution / scaling, scaling };
}

/** Tell whether the page may read the pixels of a canvas. It may not when an image of another site was drawn on it without that site's permission. */
export function isReadable(canvas: HTMLCanvasElement): boolean {
  try {
    canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

let drawing = false;

/** Tell whether a picture of the map is being drawn. The map then has the size and the view of the picture. */
export function isDrawing(): boolean {
  return drawing;
}

/**
 * Draw the map as a picture of the given size in pixels, and return it when every layer has been drawn in full.
 * OpenLayers draws all layers of a map into one canvas when the canvas is the target of the map, and takes the
 * size of the canvas as the size of the map. So the map is moved to a canvas of the size of the picture, with a
 * view of its own for the scale of the picture, and returned to its place afterwards. The view of the user is not changed. The layers named in `without` are left
 * out of the picture.
 */
export function drawMap(
  map: OlMap,
  picture: readonly [number, number],
  without: readonly string[] = [],
): Promise<Picture> {
  const place = map.getTargetElement();
  const size = map.getSize();
  const view = map.getView();
  const center = view.getCenter();
  const resolution = view.getResolution();
  const canvas = document.createElement("canvas");
  canvas.width = picture[0];
  canvas.height = picture[1];
  const context = canvas.getContext("2d");
  if (drawing) {
    return Promise.reject(new Error("Another picture of the map is being drawn."));
  }
  if (!(place instanceof HTMLElement) || !size || !center || resolution === undefined || !context) {
    return Promise.reject(new Error("The map is not shown, so no picture of it can be drawn."));
  }

  const [width = 0, height = 0] = size;
  const geometry = pictureGeometry({ size: [width, height], resolution }, picture);
  const pictureView = new View({
    projection: view.getProjection(),
    center,
    resolution: geometry.resolution,
    rotation: view.getRotation(),
    minResolution: geometry.resolution / 2,
    maxResolution: geometry.resolution * 2,
    constrainRotation: false,
    multiWorld: true,
  });
  const hidden = map.getAllLayers().filter((layer) => {
    const id: unknown = layer.get("id");
    return typeof id === "string" && without.includes(id) && layer.getVisible();
  });

  drawing = true;
  return new Promise((resolve, reject) => {
    const restore = () => {
      unByKey(key);
      window.clearTimeout(timer);
      hidden.forEach((layer) => layer.setVisible(true));
      map.setView(view);
      map.setTarget(place);
      drawing = false;
    };
    const timer = window.setTimeout(() => {
      restore();
      reject(new Error("The map was not drawn in full within two minutes, so no picture was made."));
    }, DRAWING_TIME);
    const key = map.on("rendercomplete", ({ frameState }) => {
      // A frame that was drawn before the map moved to the canvas may still report here; it is not the picture.
      if (
        !frameState ||
        map.getTargetElement() !== canvas ||
        frameState.viewState.resolution !== pictureView.getResolution() ||
        frameState.size[0] !== picture[0] ||
        frameState.size[1] !== picture[1]
      ) {
        return;
      }
      const credits = creditsOf(frameState);
      restore();
      // Where no layer has drawn, the picture is white, as the page is behind the map.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
      resolve({
        canvas,
        view: {
          projection: frameState.viewState.projection,
          center: frameState.viewState.center,
          resolution: frameState.viewState.resolution,
          rotation: frameState.viewState.rotation,
          size: [picture[0], picture[1]],
        },
        credits,
      });
    });
    hidden.forEach((layer) => layer.setVisible(false));
    map.setView(pictureView);
    map.setTarget(canvas);
  });
}
