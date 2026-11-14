/**
 * Return the place of the tab that takes the focus after a key is pressed on a tab, or undefined for a key that
 * does not move it. The left and right arrow keys move to the tab beside, and pass from the last tab to the first
 * and back. Home gives the first tab and End the last.
 */
export function tabAfterKey(current: number, count: number, key: string): number | undefined {
  if (current < 0 || current >= count) {
    return undefined;
  }
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/**
 * Return the place of the button that takes the focus after a key is pressed on a button, or undefined for a key
 * that does not move it. The buttons are counted through all the groups of the tab, and `sizes` gives the number of
 * buttons of each group. The left and right arrow keys move to the button beside, and pass from the last button to
 * the first and back. With the Control key they move to the first button of the group beside. Home gives the first
 * button and End the last.
 */
export function toolAfterKey(
  current: number,
  sizes: readonly number[],
  key: string,
  control: boolean,
): number | undefined {
  const count = sizes.reduce((sum, size) => sum + size, 0);
  if (current < 0 || current >= count) {
    return undefined;
  }
  // The place of the first button of each group.
  const starts = sizes.map((_, group) => sizes.slice(0, group).reduce((sum, size) => sum + size, 0));
  // The group of the button is the last one that starts at or before its place.
  const group = starts.filter((start) => start <= current).length - 1;
  switch (key) {
    case "ArrowRight":
      return control ? starts[(group + 1) % starts.length] : (current + 1) % count;
    case "ArrowLeft":
      return control ? starts[(group - 1 + starts.length) % starts.length] : (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/**
 * Return the name of the button on which the Tab key stops: the button that last had the focus, when the tab
 * shows it; otherwise the first finished button; otherwise the first button. A tab without buttons gives undefined.
 */
export function tabStop(
  tools: readonly { id: string; finished: boolean }[],
  last: string | undefined,
): string | undefined {
  const stop = tools.find(({ id }) => id === last) ?? tools.find(({ finished }) => finished) ?? tools[0];
  return stop?.id;
}
