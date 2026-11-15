// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/** The time after which the browser may forget the content of a saved file, in milliseconds. */
const RELEASE_TIME = 60_000;

/**
 * Save a file on the computer of the user. The content is given to the browser as a link with the attribute
 * `download`, and the browser stores it as it stores every download. The address of the link is an object
 * address of the page itself (`blob:`), so no request leaves the page.
 */
export function saveFile(content: Blob, name: string): void {
  const address = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // The browser reads the content after the click, so the address is released later.
  window.setTimeout(() => URL.revokeObjectURL(address), RELEASE_TIME);
}

/**
 * Return a text as a part of a file name: lower-case letters of the Latin alphabet and digits, with one hyphen
 * in the place of every other run of characters. A file name of this form is valid on every operating system.
 */
export function fileNamePart(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Return a date and time of the user's clock as digits, for a file name: 20261114-153012. */
export function timeStamp(time: Date): string {
  const date = `${String(time.getFullYear())}${twoDigits(time.getMonth() + 1)}${twoDigits(time.getDate())}`;
  const clock = `${twoDigits(time.getHours())}${twoDigits(time.getMinutes())}${twoDigits(time.getSeconds())}`;
  return `${date}-${clock}`;
}
