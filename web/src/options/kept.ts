// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/**
 * What Lynkeus keeps, where, and for how long: the statements of the table "What is kept" of `docs/Storage.md`.
 * The pane Storage and the dialog About copy them, and the tests compare them with that table, so that a change
 * of the document is noticed here. A statement is held as its sentences, in their order, because the pane shows
 * some of them in rows of their own.
 */
export const KEPT = {
  browser: [
    "The page keeps in the local storage of the browser the parts of the work that the user lets it keep.",
    "The stored copies stay in this browser and are not sent to the server.",
  ],
  cookie: [
    "The server sets one cookie when the visitor signs in to Earthdata.",
    "It holds a random key that names the session, and it ends after the keeping time without use or at Sign out.",
    "A visitor who does not sign in receives no cookie.",
  ],
  token: [
    "The Earthdata user token is held in the memory of the web service only.",
    "It is never stored in the browser and never written to a disk.",
  ],
  projectServer: [
    "The project server keeps the layers, the series and the jobs of an Earthdata account, under its user name, until the date that each one states.",
  ],
  files: ["The file of a layer is read by whoever holds its address, until the layer is removed."],
  log: [
    "The web server of Lynkeus writes each request in its log, except the requests to the counter of visits: the address of the visitor, the time, the request, the page that led to it and the name of the browser.",
    "It leaves out the random part of the address of a layer file, and it keeps at most 30 megabytes of log.",
    "The front web server of the machine, which Lynkeus shares with other sites, writes the same requests in a log of its own.",
  ],
  computer: [
    "A file that you download is yours alone.",
    "Lynkeus Server keeps its layers, its record, its settings and its log in one folder of your computer, and the token in memory for one job.",
  ],
  nasa: [
    "NASA Harmony makes the clipped file of a layer in your name and keeps it for 30 days.",
    "The catalogue of NASA receives each search from the project server.",
    "NASA GIBS and OpenStreetMap receive the requests of your browser for the images of the basemaps.",
  ],
} as const satisfies Record<string, readonly string[]>;

/** A place of the table "What is kept". */
export type KeptPlace = keyof typeof KEPT;

/** The name of each place in the first column of the table "What is kept" of `docs/Storage.md`. */
export const KEPT_PLACES: Record<KeptPlace, string> = {
  browser: "Browser",
  cookie: "Cookie",
  token: "Token",
  projectServer: "Project server",
  files: "Files",
  log: "Log",
  computer: "Your computer",
  nasa: "NASA",
};

/** Return the statement of a place as one text, as the table of `docs/Storage.md` writes it. */
export function statementOf(place: KeptPlace): string {
  return KEPT[place].join(" ");
}
