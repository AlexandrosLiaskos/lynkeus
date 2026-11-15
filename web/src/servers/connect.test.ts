// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, expect, test } from "vitest";
import { codeOf, connectOf, forgetConnect, isUserCode, withoutConnect } from "./connect";

const SITE = "https://lynkeus.nkua.cloud/";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

test("the address tells the code of a pairing, the word alone, or nothing", () => {
  expect(connectOf(`${SITE}?connect=WDJB-MJHT`)).toBe("WDJB-MJHT");
  expect(connectOf(`${SITE}?connect`)).toBe("");
  expect(connectOf(`${SITE}?connect=`)).toBe("");
  expect(connectOf(SITE)).toBeNull();
  expect(connectOf(`${SITE}?layer=connect#connect=WDJB-MJHT`)).toBeNull();
});

test("the word leaves the address, and the rest of the address stays", () => {
  expect(withoutConnect(`${SITE}?connect=WDJB-MJHT`)).toBe(SITE);
  expect(withoutConnect(`${SITE}?connect`)).toBe(SITE);
  expect(withoutConnect(`${SITE}?a=1&connect=WDJB-MJHT&b=2#map=7/42.8/-71`)).toBe(`${SITE}?a=1&b=2#map=7/42.8/-71`);
  expect(withoutConnect(`${SITE}#map=7/42.8/-71`)).toBe(`${SITE}#map=7/42.8/-71`);
});

test("the word leaves the address that the browser shows, without a new entry in its history", () => {
  window.history.replaceState({ kept: true }, "", "/?connect=WDJB-MJHT#map=7/42.8/-71");
  const entries = window.history.length;
  forgetConnect();
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("#map=7/42.8/-71");
  expect(window.history.state).toEqual({ kept: true });
  expect(window.history.length).toBe(entries);
  forgetConnect();
  expect(window.location.href).toBe(`${window.location.origin}/#map=7/42.8/-71`);
});

test("a code is written in its form however the visitor types it", () => {
  expect(codeOf("wdjb mjht")).toBe("WDJB-MJHT");
  expect(codeOf(" WDJB-MJHT ")).toBe("WDJB-MJHT");
  expect(codeOf("wdjbmjht")).toBe("WDJB-MJHT");
  expect(codeOf("wdj")).toBe("WDJ");
  expect(codeOf("")).toBe("");
  expect(codeOf("WDJB-MJHT-XX")).toBe("WDJB-MJHTXX");
});

test("a code has two groups of four letters without vowels", () => {
  expect(isUserCode("WDJB-MJHT")).toBe(true);
  expect(isUserCode("BCDF-VWXZ")).toBe(true);
  expect(isUserCode("WDJA-MJHT")).toBe(false);
  expect(isUserCode("WDJB-MJHTXX")).toBe(false);
  expect(isUserCode("WDJBMJHT")).toBe(false);
  expect(isUserCode("")).toBe(false);
});
