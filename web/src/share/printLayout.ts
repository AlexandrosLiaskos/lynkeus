import type OlMap from "ol/Map";
import { flushSync } from "react-dom";
import { version } from "../../package.json";
import { frameTicks } from "./frame";
import {
  dateText,
  framePicture,
  millimetres,
  printedResolution,
  projectionText,
  scaleText,
  type LayoutForm,
} from "./layout";
import { makePicture, pictureFault } from "./mapImage";
import { sheetStore } from "./sheet";

/** The title of the document while a layout is printed, when the layout has no title of its own. */
const PLAIN_TITLE = "Lynkeus map";

/**
 * Print the map on a page, through the print function of the browser, whose print window also saves the page
 * as a PDF file. The page is first laid out without the map, so that the room that the title and the foot leave
 * to the map can be measured. The map is then drawn as a picture of that size, placed on the page with the
 * marks of its coordinate frame, and the print window is opened. The page leaves the document when the print
 * window closes. The notes returned name a background map that was left out, with the reason.
 */
export async function printLayout(map: OlMap, form: LayoutForm): Promise<readonly string[]> {
  const [width = 0, height = 0] = map.getSize() ?? [];
  flushSync(() => sheetStore.set({ form, picture: null, ticks: [], facts: [], credits: [] }));
  const frame = document.querySelector(".share-sheet-map")?.getBoundingClientRect();
  if (!frame || frame.width <= 0 || frame.height <= 0 || width <= 0 || height <= 0) {
    sheetStore.set(null);
    throw new Error("The page could not be laid out, so nothing was printed.");
  }
  const frameSides = [millimetres(frame.width), millimetres(frame.height)] as const;
  const [pictureWidth, pictureHeight] = framePicture(frameSides, form.resolution, [width, height]);
  const resolution = printedResolution(pictureWidth, frameSides[0]);

  let notes: readonly string[];
  try {
    const fault = pictureFault({ width: pictureWidth, height: pictureHeight, resolution: 96 });
    if (fault !== null) {
      throw new Error("The map on the screen is too small for a page. Enlarge the window, then print again.");
    }
    const made = await makePicture(map, {
      width: pictureWidth,
      height: pictureHeight,
      resolution,
      sources: false,
      scaleBar: form.scaleBar,
      northArrow: form.northArrow ? "always" : "never",
      legends: [],
    });
    const { picture } = made;
    notes = made.notes;
    const projection =
      typeof picture.view.projection === "string"
        ? picture.view.projection
        : (picture.view.projection?.getCode() ?? "");
    flushSync(() =>
      sheetStore.set({
        form,
        picture,
        ticks: form.frame ? frameTicks(picture.view) : [],
        facts: [
          `Scale ${scaleText(picture.view, resolution)}`,
          `Projection: ${projectionText(projection)}`,
          ...(form.frame ? ["Coordinates of the frame: longitude and latitude, WGS 84"] : []),
          `Lynkeus ${version}, ${dateText(new Date())}`,
        ],
        credits: picture.credits,
      }),
    );
  } catch (error) {
    sheetStore.set(null);
    throw error;
  }

  // The print window of the browser proposes the title of the document as the name of a PDF file.
  const pageTitle = document.title;
  document.title = form.title.trim() === "" ? PLAIN_TITLE : form.title.trim();
  window.addEventListener(
    "afterprint",
    () => {
      document.title = pageTitle;
      sheetStore.set(null);
    },
    { once: true },
  );
  window.print();
  return notes;
}
