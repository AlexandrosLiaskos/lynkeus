// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetDock } from "../shared/dock/dock";
import { baseMapStore } from "./baseMaps";
import { imageryStore } from "./imagery";
import { ImageryPane } from "./ImageryPane";
import { openPane } from "./testPane";

const TERRA = "MODIS_Terra_CorrectedReflectance_TrueColor";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T12:00:00Z") });
  baseMapStore.set("blue-marble");
  imageryStore.set({ layer: TERRA, date: "2026-11-13" });
  resetDock();
});

afterEach(() => {
  vi.useRealTimers();
});

function day(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>("Day");
}

test("the pane starts with the chosen image and states the days of the layer", () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  expect(screen.getByLabelText<HTMLSelectElement>("Instrument and satellite").value).toBe(TERRA);
  expect(day().value).toBe("2026-11-13");
  expect([day().min, day().max]).toEqual(["2000-02-24", "2026-11-14"]);
  expect(screen.getByText(/from 24 Feb 2000 to 14 Nov 2026/)).toBeDefined();
});

test("the image of the chosen layer and day becomes the basemap", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.selectOptions(screen.getByLabelText("Instrument and satellite"), "VIIRS, NOAA-21");
  await userEvent.clear(day());
  await userEvent.type(day(), "2026-11-02");
  await userEvent.click(screen.getByRole("button", { name: "Show image" }));
  expect(imageryStore.get()).toEqual({ layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", date: "2026-11-02" });
  expect(baseMapStore.get()).toBe("imagery");
  expect(screen.getByRole("status").textContent).toBe("The basemap is the image of 2 Nov 2026 (VIIRS, NOAA-21).");
});

test("the two links show the day before and after, and a day after the present day is refused under the field", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.click(screen.getByRole("button", { name: "Show day before" }));
  expect(imageryStore.get().date).toBe("2026-11-12");
  expect(day().value).toBe("2026-11-12");
  await userEvent.click(screen.getByRole("button", { name: "Show day after" }));
  await userEvent.click(screen.getByRole("button", { name: "Show day after" }));
  expect(imageryStore.get().date).toBe("2026-11-14");
  await userEvent.click(screen.getByRole("button", { name: "Show day after" }));
  const fault = screen.getByRole("alert");
  expect(fault.textContent).toBe("The day lies after the present day. Enter an earlier day.");
  expect(day().getAttribute("aria-invalid")).toBe("true");
  expect(day().getAttribute("aria-describedby")?.split(" ")).toContain(fault.id);
  expect(imageryStore.get().date).toBe("2026-11-14");
});

test("a day before the first image of the layer is refused in a sentence, which goes when the day changes", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.selectOptions(screen.getByLabelText("Instrument and satellite"), "VIIRS, NOAA-20");
  await userEvent.clear(day());
  await userEvent.type(day(), "2017-12-31");
  await userEvent.click(screen.getByRole("button", { name: "Show image" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "The images of VIIRS, NOAA-20 start on 5 Jan 2018. Enter a later day.",
  );
  expect(baseMapStore.get()).toBe("blue-marble");
  await userEvent.clear(day());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("without a day the run button is inactive and the foot asks for the day", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.clear(day());
  expect(screen.getByRole("button", { name: "Show image" }).getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("Enter the day of the image.");
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("each field is described by its explanation, which shows from the button beside its title", () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  expect(explanation(day())).toBe(
    "The day of the image in Coordinated Universal Time, from 24 Feb 2000 to 14 Nov 2026. The image of the present day is still incomplete.",
  );
  expect(explanation(screen.getByLabelText("Instrument and satellite"))).toMatch(
    /^The instrument and the satellite that took the image\. .* about 306 metres at the equator\.$/,
  );
  expect(screen.getByRole("button", { name: "Information about Day" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Information about Instrument and satellite" })).toBeDefined();
});
