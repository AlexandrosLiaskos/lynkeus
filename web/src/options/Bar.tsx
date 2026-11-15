// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
interface BarProps {
  /** What the bar measures, for a screen reader, for example "Layers of the account". */
  label: string;
  /** The amount used. */
  value: number;
  /** The most that the limit allows. */
  most: number;
  /** The amount and the limit in words, as the row writes them, for example "12 of at most 50". */
  words: string;
}

/**
 * A bar that shows how much of a limit is used: a filled part whose width is the share used. It is a meter, the
 * role of WAI-ARIA for a value inside a known range, such as the used part of a disk. The words beside the bar
 * give the same numbers, so the bar is never the only statement of them. A limit of zero has no bar.
 */
export function Bar({ label, value, most, words }: BarProps) {
  // A meter has a largest value above its smallest one, so a limit of zero has no bar.
  if (most <= 0) {
    return null;
  }
  const share = Math.min(1, Math.max(0, value / most));
  return (
    <span
      className={share >= 1 ? "storage-bar storage-bar--full" : "storage-bar"}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={most}
      aria-valuenow={Math.min(Math.max(0, value), most)}
      aria-valuetext={words}
    >
      <span className="storage-bar-fill" style={{ width: `${(share * 100).toFixed(1)}%` }} />
    </span>
  );
}
