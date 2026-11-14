import type { Area } from "../shared/area";

/** A position of GeoJSON: longitude and latitude, in degrees (WGS 84). */
export type Position = [longitude: number, latitude: number];

/** The area as a GeoJSON object: a feature collection with one polygon. */
export interface AreaCollection {
  type: "FeatureCollection";
  bbox: [west: number, south: number, east: number, north: number];
  features: [
    {
      type: "Feature";
      properties: { name: string };
      geometry: { type: "Polygon"; coordinates: [Position[]] };
    },
  ];
}

/**
 * Return the area as a GeoJSON object that follows RFC 7946. The polygon has one ring. The ring starts at the
 * south-west corner, runs counterclockwise, as section 3.1.6 asks for an exterior ring, and ends on its first
 * position. The member `bbox` gives west, south, east and north, in the order of section 5. Every coordinate is
 * written as the area holds it. The object names no coordinate reference system, because section 4 fixes it
 * as WGS 84 with longitude before latitude.
 */
export function areaGeoJson({ west, south, east, north }: Area): AreaCollection {
  return {
    type: "FeatureCollection",
    bbox: [west, south, east, north],
    features: [
      {
        type: "Feature",
        properties: { name: "Area" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
      },
    ],
  };
}

/** The name of the saved file. RFC 7946 gives the ending `.geojson`. */
export const AREA_FILE_NAME = "lynkeus-area.geojson";

/** Return the area as the content of a GeoJSON file, with the media type that RFC 7946 registers. */
export function areaFile(area: Area): Blob {
  return new Blob([`${JSON.stringify(areaGeoJson(area), null, 2)}\n`], { type: "application/geo+json" });
}
