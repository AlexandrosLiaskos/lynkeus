import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Attribution, ScaleLine } from "ol/control";
import type Control from "ol/control/Control";
import OlMap from "ol/Map";
import View from "ol/View";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dockStore, enterDock, frontOf, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { Pane } from "../shared/pane/Pane";
import { PANE_WIDTH, panesStore, resetPanes, setPaneWidth, type PaneId } from "../shared/panes";
import { statusBarStore } from "../statusbar/state";
import { useViewActions } from "./actions";
import { findScaleBar } from "./scaleBar";

beforeEach(() => {
  resetDock();
  resetPanes();
  statusBarStore.set(true);
  messagesStore.set([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fullscreenEnabled");
  Reflect.deleteProperty(document, "fullscreenElement");
  document.body.replaceChildren();
});

/** Make the browser of the test able, or unable, to fill the screen, and state which element fills it. */
function setFullScreen(enabled: boolean, element: Element | null = null): void {
  Object.defineProperty(document, "fullscreenEnabled", { value: enabled, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { value: element, configurable: true });
}

interface SetUp {
  controls?: Control[];
  /** The panes that have something to show, and so are drawn beside the map. */
  panes?: PaneId[];
}

/** Give the actions of the View tab for a map that stands in the frame of the page, between its panes. */
function setUp({ controls = [new Attribution(), new ScaleLine()], panes = ["contents", "catalog"] }: SetUp = {}) {
  const frame = document.createElement("div");
  frame.className = "workspace-map";
  const target = document.createElement("main");
  target.tabIndex = 0;
  frame.append(target);
  document.body.append(frame);
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }), controls, target });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MapContext value={map}>
      {panes.includes("contents") && (
        <Pane id="contents" title="Contents">
          Layers
        </Pane>
      )}
      {panes.includes("catalog") && (
        <Pane id="catalog" title="Catalog">
          Items
        </Pane>
      )}
      {children}
    </MapContext>
  );
  const { result } = renderHook(useViewActions, { wrapper });
  return { map, frame, target, actions: () => result.current };
}

test("the Contents and Catalog buttons hide and show their panes and are pressed while the pane is on the page", async () => {
  setFullScreen(true);
  const { actions } = setUp();
  expect(screen.getByRole("complementary", { name: "Contents" })).toBeDefined();
  expect(actions()["view-contents"]?.pressed).toBe(true);
  act(() => actions()["view-contents"]?.run());
  expect(panesStore.get().contents.open).toBe(false);
  expect(screen.queryByRole("complementary", { name: "Contents" })).toBeNull();
  expect(actions()["view-contents"]?.pressed).toBe(false);
  expect(actions()["view-catalog"]?.pressed).toBe(true);
  act(() => actions()["view-catalog"]?.run());
  expect(screen.queryByRole("complementary", { name: "Catalog" })).toBeNull();
  act(() => actions()["view-catalog"]?.run());
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(actions()["view-catalog"]?.pressed).toBe(true);
  // The close button of a pane releases the button of the tab.
  await userEvent.click(screen.getByRole("button", { name: "Close the Catalog pane" }));
  expect(actions()["view-catalog"]?.pressed).toBe(false);
});

test("the button of a pane that has nothing to show is not pressed, and a press says why", () => {
  setFullScreen(true);
  const { actions } = setUp({ panes: ["contents"] });
  expect(panesStore.get().catalog.open).toBe(true);
  expect(screen.queryByRole("complementary", { name: "Catalog" })).toBeNull();
  expect(actions()["view-catalog"]?.pressed).toBe(false);
  act(() => actions()["view-catalog"]?.run());
  expect(panesStore.get().catalog.open).toBe(true);
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["info", "The Catalog pane has nothing to show yet."],
  ]);
  expect(actions()["view-contents"]?.pressed).toBe(true);
});

test("a press brings a pane that stands behind the pane of a tool to the front, and the next press hides it", () => {
  setFullScreen(true);
  const { actions } = setUp();
  act(() => enterDock({ id: "tool", title: "Tool" }));
  expect(frontOf(dockStore.get(), "right")).toBe("tool");
  expect(actions()["view-catalog"]?.pressed).toBe(true);
  act(() => actions()["view-catalog"]?.run());
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  expect(panesStore.get().catalog.open).toBe(true);
  act(() => actions()["view-catalog"]?.run());
  expect(panesStore.get().catalog.open).toBe(false);
  expect(actions()["view-catalog"]?.pressed).toBe(false);
});

test("Reset panes returns both panes to their first state and closes the panes of tools", () => {
  setFullScreen(true);
  const { actions } = setUp();
  act(() => {
    actions()["view-contents"]?.run();
    setPaneWidth("catalog", PANE_WIDTH.largest);
    openToolPane("first-tool");
    openToolPane("second-tool");
  });
  expect(dockStore.get().tools).toEqual(["first-tool", "second-tool"]);
  act(() => actions()["view-reset-panes"]?.run());
  expect(panesStore.get()).toEqual({
    contents: { open: true, width: PANE_WIDTH.first },
    catalog: { open: true, width: PANE_WIDTH.first },
  });
  expect(dockStore.get().tools).toEqual([]);
  expect(actions()["view-reset-panes"]?.pressed).toBeUndefined();
});

test("the Status bar button shows and hides the status bar", () => {
  setFullScreen(true);
  const { actions } = setUp();
  expect(actions()["view-status-bar"]?.pressed).toBe(true);
  act(() => actions()["view-status-bar"]?.run());
  expect(statusBarStore.get()).toBe(false);
  expect(actions()["view-status-bar"]?.pressed).toBe(false);
  act(() => actions()["view-status-bar"]?.run());
  expect(statusBarStore.get()).toBe(true);
});

test("the Scale bar button takes the scale bar off the map and puts the same one back", () => {
  setFullScreen(true);
  const { map, actions } = setUp();
  const bar = findScaleBar(map);
  expect(bar).not.toBeNull();
  expect(actions()["view-scale-bar"]?.pressed).toBe(true);
  act(() => actions()["view-scale-bar"]?.run());
  expect(findScaleBar(map)).toBeNull();
  expect(map.getControls().getLength()).toBe(1);
  expect(actions()["view-scale-bar"]?.pressed).toBe(false);
  act(() => actions()["view-scale-bar"]?.run());
  expect(findScaleBar(map)).toBe(bar);
  expect(actions()["view-scale-bar"]?.pressed).toBe(true);
});

test("on a map without a scale bar the Scale bar button has no action", () => {
  setFullScreen(true);
  const { actions } = setUp({ controls: [new Attribution()] });
  expect(actions()["view-scale-bar"]).toBeUndefined();
});

test("in a browser that cannot fill the screen the Full screen button has no action", () => {
  setFullScreen(false);
  const { actions } = setUp();
  expect(actions()["view-full-screen"]).toBeUndefined();
  expect(actions()["view-contents"]).toBeDefined();
});

test("Full screen asks the browser to show the frame of the map over the whole screen and gives the keyboard focus to the map", async () => {
  setFullScreen(true);
  const { frame, target, actions } = setUp();
  const request = vi.fn(() => Promise.resolve());
  frame.requestFullscreen = request;
  expect(actions()["view-full-screen"]?.pressed).toBe(false);
  await act(async () => {
    actions()["view-full-screen"]?.run();
    await Promise.resolve();
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(target);
});

test("the Full screen button follows the browser: pressed while an element fills the screen, and not after the Escape key", () => {
  setFullScreen(true);
  const { frame, actions } = setUp();
  act(() => {
    setFullScreen(true, frame);
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  expect(actions()["view-full-screen"]?.pressed).toBe(true);
  // The browser itself leaves the full screen on the Escape key and reports the change.
  act(() => {
    setFullScreen(true, null);
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  expect(actions()["view-full-screen"]?.pressed).toBe(false);
});

test("Full screen returns to the page when an element already fills the screen", () => {
  setFullScreen(true);
  const { frame, actions } = setUp();
  const exit = vi.fn(() => Promise.resolve());
  document.exitFullscreen = exit;
  act(() => {
    setFullScreen(true, frame);
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  act(() => actions()["view-full-screen"]?.run());
  expect(exit).toHaveBeenCalledTimes(1);
});

test("the keyboard focus returns to the element that had it when the full screen ends", async () => {
  setFullScreen(true);
  const { frame, actions } = setUp();
  frame.requestFullscreen = () => Promise.resolve();
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  await act(async () => {
    actions()["view-full-screen"]?.run();
    await Promise.resolve();
  });
  expect(document.activeElement).not.toBe(button);
  act(() => {
    setFullScreen(true, frame);
    document.dispatchEvent(new Event("fullscreenchange"));
    setFullScreen(true, null);
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  expect(document.activeElement).toBe(button);
});

test("a refusal of the browser to fill the screen is reported", async () => {
  setFullScreen(true);
  const { frame, actions } = setUp();
  frame.requestFullscreen = () => Promise.reject(new TypeError("not allowed"));
  await act(async () => {
    actions()["view-full-screen"]?.run();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["error", "The browser did not allow the map to fill the screen."],
  ]);
});
