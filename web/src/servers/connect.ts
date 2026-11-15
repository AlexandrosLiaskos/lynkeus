import { USER_CODE } from "../shared/servers";

/**
 * The address with which Lynkeus Server opens the site for a pairing: `https://lynkeus.nkua.cloud/?connect`, or
 * `?connect=WDJB-MJHT` with the code that the program shows (`docs/Own_Servers.md`, Pairing).
 */

/**
 * Return what the address of the page says about a pairing: the code after `connect`, an empty text for the word
 * `connect` without a code, or null when the address does not carry the word.
 */
export function connectOf(address: string): string | null {
  const given = new URL(address).searchParams;
  return given.has("connect") ? (given.get("connect") ?? "") : null;
}

/** Return the address of the page without the word `connect`. The rest of the address stays as it is. */
export function withoutConnect(address: string): string {
  const url = new URL(address);
  url.searchParams.delete("connect");
  return url.href;
}

/** Take the word `connect` out of the address that the browser shows, without loading the page again. */
export function forgetConnect(): void {
  if (connectOf(window.location.href) !== null) {
    window.history.replaceState(window.history.state, "", withoutConnect(window.location.href));
  }
}

/**
 * Write a code as the visitor may have typed it in the form of a code: in capital letters, without spaces and
 * other marks, and with the hyphen after the fourth letter. "wdjb mjht" becomes "WDJB-MJHT".
 */
export function codeOf(text: string): string {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
}

/** Tell whether a text has the form of a code of a pairing. */
export function isUserCode(text: string): boolean {
  return USER_CODE.test(text);
}
