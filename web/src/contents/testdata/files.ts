// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { fromArrayBuffer } from "geotiff";
import { readCog, type Cog } from "../cog";
import backscatter from "./backscatter.json";
import coherence from "./coherence.json";

/** Return the bytes that a text holds in base64. */
function bytesOf(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)).buffer;
}

/** Open one of the test files, which `README.md` describes. */
export async function openTestFile(name: "backscatter" | "coherence"): Promise<Cog> {
  return readCog(await fromArrayBuffer(bytesOf((name === "backscatter" ? backscatter : coherence).base64)));
}
