import type { ReactNode } from "react";

/**
 * The marks that the text of a method sheet uses inside a line: a name written as code between two grave
 * accents, a link written as `[words](address)`, and an address between angle brackets.
 */
const MARK = /`([^`]+)`|\[((?:[^\]`]|`[^`]*`)+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;

/** Tell whether an address is an address of the web. An address inside the repository is not one. */
function isWebAddress(address: string): boolean {
  return /^https?:\/\//.test(address);
}

/**
 * Return a text of a method sheet as elements of the page: a name written as code, a link to an address of the
 * web, which opens in a new tab so that the page keeps its map, and the words between them. A link to a file of
 * the repository shows its words only, because the page does not hold that file.
 */
export function marked(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let end = 0;
  for (const found of text.matchAll(MARK)) {
    const [whole, code, words, address, bare] = found;
    if (found.index > end) {
      parts.push(text.slice(end, found.index));
    }
    const key = parts.length;
    if (code !== undefined) {
      parts.push(<code key={key}>{code}</code>);
    } else if (words !== undefined && address !== undefined && isWebAddress(address)) {
      parts.push(
        <a key={key} href={address} target="_blank" rel="noopener">
          {marked(words)}
        </a>,
      );
    } else if (words !== undefined) {
      parts.push(<span key={key}>{marked(words)}</span>);
    } else if (bare !== undefined) {
      parts.push(
        <a key={key} href={bare} target="_blank" rel="noopener">
          {bare}
        </a>,
      );
    }
    end = found.index + whole.length;
  }
  if (end < text.length) {
    parts.push(text.slice(end));
  }
  return parts;
}

/** A text of a method sheet, with its names written as code and its links. */
export function Marked({ text }: { text: string }) {
  return <>{marked(text)}</>;
}
