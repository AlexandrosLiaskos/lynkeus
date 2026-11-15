// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { domAnimation, LazyMotion, MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * A part of the page whose elements enter and leave with the Motion library: a side of panes, the messages over
 * the map, a notice. It loads the part of the library that animates an element and its leaving, which the `m`
 * components inside it use. A visitor who has asked the operating system for less motion sees every change at
 * once: the library leaves out the movement for such a visitor, and this component leaves out the fade too.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() === true;
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user" skipAnimations={reduced}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
