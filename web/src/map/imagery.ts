// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import XYZ from "ol/source/XYZ";
import { createStore } from "../shared/store";
import { formatDate } from "./day";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/**
 * The daily true-colour images that NASA GIBS serves in Web Mercator, with the first day of each. The names of
 * the layers, their first days and their tile matrix set (GoogleMapsCompatible_Level9, zoom levels 0 to 9) were
 * read from the capabilities document of the service on 14 Nov 2026.
 */
export const IMAGERY = [
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", title: "MODIS, Terra", first: "2000-02-24" },
  { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", title: "MODIS, Aqua", first: "2002-07-03" },
  { id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", title: "VIIRS, NOAA-20", first: "2018-01-05" },
  { id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", title: "VIIRS, NOAA-21", first: "2023-02-10" },
] as const;
export type ImageryId = (typeof IMAGERY)[number]["id"];

/** The image that the user has chosen: the instrument and satellite, and the day as year-month-day. */
export interface ImageryChoice {
  layer: ImageryId;
  date: string;
}

/** Return a day of Coordinated Universal Time as year-month-day. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Return the day before a moment, in Coordinated Universal Time. The image of the present day is still incomplete. */
export function dayBefore(date: Date): string {
  return utcDay(new Date(date.getTime() - 24 * 60 * 60 * 1000));
}

export const IMAGERY_FAULTS = {
  noDay: "Enter the day as year, month and day.",
  future: "The day lies after the present day. Enter an earlier day.",
  early: (title: string, first: string) => `The images of ${title} start on ${formatDate(first)}. Enter a later day.`,
} as const;

/** Return the sentence that says why an image cannot be shown, or null when it can. */
export function imageryFault({ layer, date }: ImageryChoice, today: string): string | null {
  const { title, first } = IMAGERY.find(({ id }) => id === layer) ?? IMAGERY[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || utcDay(new Date(date)) !== date) {
    return IMAGERY_FAULTS.noDay;
  }
  if (date > today) {
    return IMAGERY_FAULTS.future;
  }
  return date < first ? IMAGERY_FAULTS.early(title, first) : null;
}

/** Return the address of the tiles of an image. */
export function imageryUrl({ layer, date }: ImageryChoice): string {
  return `${GIBS}/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg`;
}

/** Return the credit of an image: its day, its instrument and satellite, and the service that gives it. */
export function imageryAttribution({ layer, date }: ImageryChoice): string {
  const title = IMAGERY.find(({ id }) => id === layer)?.title ?? "";
  return `Image of ${date} (${title}): <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS</a>`;
}

/** The image that is shown when the background map is the imagery of a date. It starts as the day before today. */
export const imageryStore = createStore<ImageryChoice>({ layer: IMAGERY[0].id, date: dayBefore(new Date()) });

/** Create the source of the imagery of a date. It follows the chosen image. */
export function createImagerySource(): XYZ {
  const source = new XYZ({
    url: imageryUrl(imageryStore.get()),
    maxZoom: 9,
    crossOrigin: "anonymous",
    attributions: imageryAttribution(imageryStore.get()),
  });
  imageryStore.subscribe(() => {
    source.setUrl(imageryUrl(imageryStore.get()));
    source.setAttributions(imageryAttribution(imageryStore.get()));
  });
  return source;
}
