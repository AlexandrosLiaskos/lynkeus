/**
 * Give the keyboard focus to the heading of the open dialog when the element that held the focus has left the
 * page, as the button of a step does when the next step takes its place. The focus stays where it is when an
 * element of the page holds it.
 */
export function focusHeading(): void {
  if (document.activeElement === null || document.activeElement === document.body) {
    document.querySelector<HTMLElement>("dialog[open] .usa-modal__heading")?.focus();
  }
}
