// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach } from "vitest";

// An element that enters or leaves with the Motion library takes its last state at once, without the time of the
// motion.
MotionGlobalConfig.skipAnimations = true;

// Each test starts with an empty page.
afterEach(cleanup);

// Each test starts with an empty storage of the browser, so that no test reads what another one stored. A test
// that has put another object in the place of the storage is left alone.
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // The storage of the test before this one refuses every call.
  }
});
