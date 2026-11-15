// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
export default {
  extends: ["stylelint-config-standard-scss"],
  plugins: ["stylelint-high-performance-animation"],
  rules: {
    // Only transform and opacity are animated, so that the graphics card draws the motion. The rule
    // reads the property names written in a transition, an animation or a set of keyframes; it does
    // not see the properties passed to the mixin tokens.transition.
    "plugin/no-low-performance-animation-properties": true,
    // The rules below concern the way of writing only, and the style files broke them when the
    // check was added (counts of 15 November 2026 in brackets). They stay off until the files are
    // rewritten in one change, because several branches edit the style files at present.
    // Class names follow the U.S. Web Design System: block__element and block--variant (87).
    "selector-class-pattern": null,
    // A comment that follows a declaration without an empty line (4).
    "scss/double-slash-comment-empty-line-before": null,
    // min-width and max-width in media queries instead of the range form (2).
    "media-feature-range-notation": null,
    // An empty comment line that separates two paragraphs of a comment (1).
    "scss/comment-no-empty": null,
    // The font name Georgia with a capital letter (1).
    "value-keyword-case": null,
  },
};
