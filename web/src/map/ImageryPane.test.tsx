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
  expect(screen.getByText(/from 2000-02-24 to 2026-11-14/)).toBeDefined();
});

test("the image of the chosen layer and day becomes the background map", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.selectOptions(screen.getByLabelText("Instrument and satellite"), "VIIRS, NOAA-21");
  await userEvent.clear(day());
  await userEvent.type(day(), "2026-11-02");
  await userEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(imageryStore.get()).toEqual({ layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", date: "2026-11-02" });
  expect(baseMapStore.get()).toBe("imagery");
  expect(screen.getByRole("status").textContent).toBe(
    "The background map is the image of 2026-11-02 (VIIRS, NOAA-21).",
  );
});

test("the two buttons step to the day before and after, and a day after the present day is refused", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.click(screen.getByRole("button", { name: "Day before" }));
  expect(imageryStore.get().date).toBe("2026-11-12");
  expect(day().value).toBe("2026-11-12");
  await userEvent.click(screen.getByRole("button", { name: "Day after" }));
  await userEvent.click(screen.getByRole("button", { name: "Day after" }));
  expect(imageryStore.get().date).toBe("2026-11-14");
  await userEvent.click(screen.getByRole("button", { name: "Day after" }));
  expect(screen.getByRole("alert").textContent).toBe("The day lies after the present day.");
  expect(imageryStore.get().date).toBe("2026-11-14");
});

test("a day before the first image of the layer is refused in a sentence", async () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  await userEvent.selectOptions(screen.getByLabelText("Instrument and satellite"), "VIIRS, NOAA-20");
  await userEvent.clear(day());
  await userEvent.type(day(), "2017-12-31");
  await userEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(screen.getByRole("alert").textContent).toBe("The images of VIIRS, NOAA-20 start on 2018-01-05.");
  expect(baseMapStore.get()).toBe("blue-marble");
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("each field is described by its explanation, which shows from the button beside its title", () => {
  openPane("imagery-of-a-date", <ImageryPane />);
  expect(explanation(day())).toBe(
    "The day of the image in Coordinated Universal Time, from 2000-02-24 to 2026-11-14. The image of the present day is still incomplete.",
  );
  expect(explanation(screen.getByLabelText("Instrument and satellite"))).toMatch(
    /^The instrument and the satellite that took the image\. .* about 306 metres at the equator\.$/,
  );
  expect(screen.getByRole("button", { name: "Information about Day" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Information about Instrument and satellite" })).toBeDefined();
});
