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
