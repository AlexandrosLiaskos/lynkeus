// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
// @vitest-environment node
import { compileStringAsync } from "sass-embedded";
import { beforeAll, expect, test } from "vitest";

const SIZES = ["text", "text-small", "target", "motion"];
const DISTANCES = ["space-1", "space-2", "space-3", "space-4", "pane-padding", "field-gap", "group-gap"];
const TEXT_COLOURS = ["ink", "secondary", "muted", "link"];
const BACKGROUNDS = ["hover", "selected"];
const ALERT_BACKGROUNDS = ["white", "info-lighter", "success-lighter", "warning-lighter", "error-lighter"];

/** The values of the file and the backgrounds of the alert of the design system, as the Sass compiler writes them. */
const values = new Map<string, string>();

beforeAll(async () => {
  const own = [...SIZES, ...DISTANCES, ...TEXT_COLOURS, ...BACKGROUNDS];
  const sass = `
    @use "sass:meta";
    @use "uswds-core" as uswds with ($theme-show-notifications: false);
    @use "src/shared/tokens/tokens";
    :root {
      ${own.map((name) => `--${name}: #{meta.inspect(tokens.$${name})};`).join("\n")}
      ${ALERT_BACKGROUNDS.map((name) => `--${name}: #{uswds.color("${name}")};`).join("\n")}
    }`;
  const { css } = await compileStringAsync(sass, { loadPaths: ["node_modules/@uswds/uswds/packages", "."] });
  for (const [, name, value] of css.matchAll(/--([\w-]+): ([^;]+);/g)) {
    if (name !== undefined && value !== undefined) {
      values.set(name, value);
    }
  }
}, 120_000);

/** Return the number of a value of the file, which is written in rem or in seconds. */
function size(name: string): number {
  return parseFloat(values.get(name) ?? "");
}

/** Return the red, green and blue parts of a colour that the compiler wrote as `white`, `#rgb` or `#rrggbb`. */
function parts(colour: string): number[] {
  if (colour === "white") {
    return [255, 255, 255];
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(colour);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  const digits = short ? short.slice(1).map((digit) => digit + digit) : long ? long.slice(1) : null;
  if (!digits) {
    throw new Error(`The colour "${colour}" is not understood.`);
  }
  return digits.map((pair) => parseInt(pair, 16));
}

/** Return the relative luminance of a colour, as the Web Content Accessibility Guidelines define it. */
function luminance(colour: string): number {
  const [red = 0, green = 0, blue = 0] = parts(colour).map((part) => {
    const share = part / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Return the contrast ratio of two colours, from 1 to 21. */
function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

test("the contrast of black with white is 21 to 1, and of a colour with itself 1 to 1", () => {
  expect(contrast("#000000", "white")).toBeCloseTo(21, 5);
  expect(contrast("#fff", "#ffffff")).toBe(1);
});

test("text is 13 pixels, and no text is smaller than 12 pixels", () => {
  expect(values.get("text")).toBe("0.8125rem");
  expect(values.get("text-small")).toBe("0.75rem");
});

test("the distances stand on a grid of 4 pixels", () => {
  for (const name of DISTANCES) {
    expect(size(name), name).toBeGreaterThan(0);
    expect(size(name) % 0.25, name).toBe(0);
  }
});

test("a target of the pointer is 24 pixels, and a change of state takes at most 150 milliseconds", () => {
  expect(values.get("target")).toBe("1.5rem");
  expect(values.get("motion")).toMatch(/s$/);
  expect(size("motion")).toBeLessThanOrEqual(0.15);
});

test("every colour of text has a contrast of at least 4.5 to 1 with every background of a pane", () => {
  for (const text of TEXT_COLOURS) {
    for (const background of [...BACKGROUNDS, ...ALERT_BACKGROUNDS]) {
      const ratio = contrast(values.get(text) ?? "", values.get(background) ?? "");
      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
