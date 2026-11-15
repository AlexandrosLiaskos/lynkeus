// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { LayerDescription } from "../shared/layer";
import { fileNamePart } from "./download";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Return the ways in which a title may write a day: 2026-10-21, 21 Oct 2026 and 21 October 2026. */
function writings(day: string): string[] {
  const [year = "", month = "", date = ""] = day.split("-");
  const name = MONTHS[Number(month) - 1] ?? "";
  return [day, `${String(Number(date))} ${name} ${year}`, `${String(Number(date))} ${name.slice(0, 3)} ${year}`];
}

/**
 * Return the name of the file of a layer, built from its title and its dates: the title in lower-case letters
 * and digits, then each date as eight digits, for example `backscatter-hh-20261021.tif`. The title of a layer
 * that was received ends with its dates in words; they are taken out of it, so that the name gives each date
 * once.
 */
export function layerFileName({ title, dates }: Pick<LayerDescription, "title" | "dates">, ending: string): string {
  let name = title;
  if (dates.length > 0) {
    // A date is not a part of a longer number: "9 Oct 2026" does not stand inside "19 Oct 2026".
    const written = dates.flatMap(writings).map((writing) => writing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const date = `(?<!\\d)(?:${written.join("|")})(?!\\d)`;
    // A date leaves with the comma before it, and two dates with the word "to" between them.
    name = name.replace(new RegExp(`[\\s,]*${date}(?:\\s+to\\s+${date})*`, "g"), " ");
  }
  const parts = [fileNamePart(name) || "layer", ...dates.map((day) => day.replaceAll("-", ""))];
  return `${parts.join("-")}.${ending}`;
}

/**
 * Save a file of the site on the computer of the user, under a given name. The browser asks the server for the
 * file and stores it as a download, so a large file does not pass through the memory of the page.
 */
export function saveAddress(address: string, name: string): void {
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}
