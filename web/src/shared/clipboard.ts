// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/**
 * Copy a text to the clipboard of the user. The browser gives a page the clipboard only on a secure address
 * (HTTPS), and it may refuse the copy; the promise then fails.
 */
export async function copyText(text: string): Promise<void> {
  if (!window.isSecureContext) {
    throw new Error("The browser gives the clipboard only to a page with a secure address.");
  }
  await navigator.clipboard.writeText(text);
}
