import { afterEach, expect, test, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a text is written to the clipboard on a secure address", async () => {
  vi.stubGlobal("isSecureContext", true);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await copyText("https://lynkeus.nkua.cloud/#map=2/20/0");
  expect(writeText).toHaveBeenCalledWith("https://lynkeus.nkua.cloud/#map=2/20/0");
});

test("the copy fails on an address that is not secure, and when the browser refuses it", async () => {
  vi.stubGlobal("isSecureContext", false);
  await expect(copyText("text")).rejects.toThrow("secure address");
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Not allowed")) } });
  await expect(copyText("text")).rejects.toThrow("Not allowed");
});
