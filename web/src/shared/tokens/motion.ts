// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.

// The times, in seconds, and the easing curves of an element that enters or leaves (a menu, a bubble, a pane, a
// message). `_tokens.scss` of this folder holds the same values for the styles.
export const MOTION_ENTER = 0.16;
export const MOTION_EXIT = 0.12;
export const MOTION_PANE = 0.2;
export const EASE_ENTER = [0.2, 0, 0, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;
