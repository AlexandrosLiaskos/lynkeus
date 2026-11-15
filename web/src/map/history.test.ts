// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { createViewHistory, HISTORY_LENGTH, type ViewState } from "./history";

function view(x: number): ViewState {
  return { center: [x, 0], resolution: 100, rotation: 0 };
}

test("the steps go back and forward through the views in order", () => {
  const history = createViewHistory();
  [1, 2, 3].forEach((x) => history.visit(view(x)));
  expect(history.back()).toEqual(view(2));
  expect(history.back()).toEqual(view(1));
  expect(history.back()).toBeNull();
  expect(history.forward()).toEqual(view(2));
  expect(history.forward()).toEqual(view(3));
  expect(history.forward()).toBeNull();
});

test("a new view after a step back drops the later views", () => {
  const history = createViewHistory();
  [1, 2, 3].forEach((x) => history.visit(view(x)));
  history.back();
  history.visit(view(9));
  expect(history.forward()).toBeNull();
  expect(history.back()).toEqual(view(2));
});

test("the same view is recorded once", () => {
  const history = createViewHistory();
  history.visit(view(1));
  history.visit(view(1));
  history.visit({ ...view(1), rotation: 0.5 });
  expect(history.back()).toEqual(view(1));
  expect(history.back()).toBeNull();
});

test("only the latest views are kept", () => {
  const history = createViewHistory();
  for (let x = 0; x < HISTORY_LENGTH + 20; x += 1) {
    history.visit(view(x));
  }
  let steps = 0;
  let last: ViewState | null = null;
  for (let step = history.back(); step; step = history.back()) {
    steps += 1;
    last = step;
  }
  expect(steps).toBe(HISTORY_LENGTH - 1);
  expect(last).toEqual(view(20));
});
