// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

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
