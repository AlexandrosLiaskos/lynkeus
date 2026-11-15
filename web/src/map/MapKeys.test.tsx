// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import { beforeEach, expect, test, vi } from "vitest";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { NOTICES } from "./commands";
import { toolKeysStore } from "./keys";
import { MapKeys } from "./MapKeys";
import { toolStore } from "./state";
import { pressKey } from "./testKeys";

function start() {
  const map = new OlMap({ view: new View({ center: [1000, 2000], zoom: 5 }) });
  const before = map.getInteractions().getLength();
  const { unmount } = render(
    <MapContext value={map}>
      <MapKeys />
    </MapContext>,
  );
  const keys = map.getInteractions().item(map.getInteractions().getLength() - 1);
  return { map, keys, before, unmount };
}

beforeEach(() => {
  toolStore.set(null);
  toolKeysStore.set(null);
  messagesStore.set([]);
});

test("the keys are added to the map and removed with the component", () => {
  const { map, before, unmount } = start();
  expect(map.getInteractions().getLength()).toBe(before + 1);
  unmount();
  expect(map.getInteractions().getLength()).toBe(before);
});

test("the comma and period keys step through the views, and say so when there is none", () => {
  const { keys } = start();
  pressKey(keys, ",");
  pressKey(keys, ".");
  expect(messagesStore.get().map(({ text }) => text)).toEqual([NOTICES.noEarlierView, NOTICES.noLaterView]);
});

test("the Enter, Backspace and Escape keys go to the tool in use", () => {
  const { keys } = start();
  const tool = { point: vi.fn(), cancel: vi.fn(() => true), back: vi.fn() };
  toolStore.set("area-rectangle");
  toolKeysStore.set(tool);
  pressKey(keys, "Enter");
  expect(tool.point).toHaveBeenCalledWith([1000, 2000]);
  pressKey(keys, "Backspace");
  expect(tool.back).toHaveBeenCalledTimes(1);
  pressKey(keys, "Escape");
  expect(toolStore.get()).toBe("area-rectangle");
  tool.cancel.mockReturnValue(false);
  pressKey(keys, "Escape");
  expect(toolStore.get()).toBeNull();
});
