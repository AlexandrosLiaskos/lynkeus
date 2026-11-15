// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { dockStore, resetDock } from "../shared/dock/dock";
import { useOptionsActions } from "./actions";
import { STORAGE_PANE } from "./StoragePane";
import { OPTIONS_TAB } from "./tab";

beforeEach(() => {
  resetDock();
});

test("the Storage button opens the pane Browser storage, and the pane carries the name of the button", () => {
  const { result } = renderHook(() => useOptionsActions());
  expect(OPTIONS_TAB.groups[0].tools[0]).toMatchObject({ id: STORAGE_PANE, label: "Storage", icon: "settings" });
  expect(result.current[STORAGE_PANE]?.missing).toBeUndefined();
  act(() => result.current[STORAGE_PANE]?.run());
  expect(dockStore.get().tools).toEqual([STORAGE_PANE]);
});
