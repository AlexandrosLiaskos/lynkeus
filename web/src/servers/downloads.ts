// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/**
 * The downloads of the program Lynkeus Server, read from the latest release of the repository of Lynkeus on
 * GitHub. The page asks the REST API of GitHub for the latest release ("Get the latest release",
 * `GET /repos/{owner}/{repo}/releases/latest`). The answer lists the files of the release, each with its name,
 * its size and its address, which has the form
 * `https://github.com/{owner}/{repo}/releases/download/{tag}/{name}`. A repository without a release answers
 * 404. The API accepts requests from any site, and it accepts 60 requests an hour from one address without a
 * sign-in, so the page asks only when the visitor opens the steps that connect a server, and once for a list of
 * servers that holds a server with the older Lynkeus Server.
 */

import { createStore } from "../shared/store";

/** The repository of Lynkeus on GitHub, as owner and name. */
export const REPOSITORY = "AlexandrosLiaskos/lynkeus";

/** The systems for which Lynkeus Server is built, with the words that name them. */
export const SYSTEMS = { windows: "Windows", macos: "macOS", linux: "Linux" } as const;
export type System = keyof typeof SYSTEMS;

/** One file of a release that holds Lynkeus Server for one system. */
export interface Download {
  system: System;
  /** Name of the file. */
  name: string;
  /** Address of the file on GitHub. */
  address: string;
  /** Size of the file, in bytes. */
  size: number;
}

/** The latest release of a repository, as far as the page shows it. */
export interface Release {
  /** Name of the version: the tag of the release. */
  version: string;
  /** When the release was published, as a date-time of RFC 3339, or null when GitHub does not state it. */
  published: string | null;
  /** The files of Lynkeus Server, in the order of the systems and, for one system, of the release. */
  downloads: readonly Download[];
}

/** What the page knows of the downloads. */
export type Downloads =
  | { state: "published"; release: Release }
  /** The repository has no release yet. */
  | { state: "none" }
  /** GitHub gave no answer that could be read. */
  | { state: "unknown" };

/** Return the address at which the REST API of GitHub gives the latest release of a repository. */
export function latestReleaseAddress(repository: string): string {
  return `https://api.github.com/repos/${repository}/releases/latest`;
}

/** Return the address of the page of a repository that lists its releases. */
export function releasesPage(repository: string): string {
  return `https://github.com/${repository}/releases`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The names of the files of Lynkeus Server in a release, as `docs/Own_Servers.md` fixes them: the installer
 * `Lynkeus-Server-<version>-Windows.exe`, the disk image `Lynkeus-Server-<version>-macOS.dmg` and the archive
 * `Lynkeus-Server-<version>-Linux.tar.gz`.
 */
const NAMES: readonly (readonly [RegExp, System])[] = [
  [/^Lynkeus-Server-.+-Windows\.exe$/, "windows"],
  [/^Lynkeus-Server-.+-macOS\.dmg$/, "macos"],
  [/^Lynkeus-Server-.+-Linux\.tar\.gz$/, "linux"],
];

/**
 * Return the system of a file of a release, from its name, or null for a file that is not Lynkeus Server for
 * one of the three systems.
 */
export function systemOfName(name: string): System | null {
  return NAMES.find(([form]) => form.test(name))?.[1] ?? null;
}

/**
 * Return the system of the computer of the visitor, from the text with which the browser names itself (the
 * header `User-Agent`), or null when the text names none of the three, as on a telephone or a tablet.
 */
export function systemOfAgent(agent: string): System | null {
  if (/Android|iPhone|iPad|iPod/.test(agent)) {
    return null;
  }
  if (agent.includes("Windows")) {
    return "windows";
  }
  if (/Macintosh|Mac OS X/.test(agent)) {
    return "macos";
  }
  return agent.includes("Linux") ? "linux" : null;
}

/**
 * Return the system of the computer of a server, from the name of the system that the server reports
 * (`lynkeus.computer.system_name`: "Windows 11", "macOS 15.1", or the name of a Linux system), or null when the
 * server could not name its system.
 */
export function systemOfServer(system: string): System | null {
  if (system === "Unknown system") {
    return null;
  }
  if (system.startsWith("Windows")) {
    return "windows";
  }
  return system.startsWith("macOS") ? "macos" : "linux";
}

/**
 * Read the latest release of a repository from the answer of the REST API of GitHub, or return null for an
 * answer of another form. Only a file whose address is one of the release files of that repository is kept, so
 * that a link of the page leads nowhere else.
 */
export function releaseOf(answer: unknown, repository: string): Release | null {
  if (!isRecord(answer) || typeof answer.tag_name !== "string" || answer.tag_name === "") {
    return null;
  }
  const { assets, published_at: published } = answer;
  if (!Array.isArray(assets)) {
    return null;
  }
  const start = `https://github.com/${repository}/releases/download/`;
  const downloads: Download[] = [];
  for (const asset of assets as unknown[]) {
    if (!isRecord(asset)) {
      continue;
    }
    const { name, size, browser_download_url: address } = asset;
    const system = typeof name === "string" ? systemOfName(name) : null;
    if (
      typeof name === "string" &&
      system !== null &&
      typeof address === "string" &&
      address.startsWith(start) &&
      typeof size === "number" &&
      size >= 0
    ) {
      downloads.push({ system, name, address, size });
    }
  }
  const order = Object.keys(SYSTEMS);
  downloads.sort((one, other) => order.indexOf(one.system) - order.indexOf(other.system));
  return {
    version: answer.tag_name,
    published: typeof published === "string" && !Number.isNaN(Date.parse(published)) ? published : null,
    downloads,
  };
}

/**
 * Ask GitHub for the latest release of the repository of Lynkeus. The request carries no cookie. The promise is
 * never rejected: without an answer that can be read, the state is "unknown".
 */
export async function latestRelease(repository = REPOSITORY): Promise<Downloads> {
  try {
    const response = await fetch(latestReleaseAddress(repository), {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (response.status === 404) {
      return { state: "none" };
    }
    if (!response.ok) {
      return { state: "unknown" };
    }
    const release = releaseOf(await response.json(), repository);
    return release ? { state: "published", release } : { state: "unknown" };
  } catch {
    return { state: "unknown" };
  }
}

/** The latest release as the list of the servers knows it, or null before GitHub was asked. */
export const releaseStore = createStore<Downloads | null>(null);

let asked: Promise<void> | null = null;

/**
 * Ask GitHub for the latest release once for the list of the servers, which offers its file to a server that
 * runs the older Lynkeus Server. The list is read again every few seconds and GitHub accepts 60 requests an
 * hour, so an answer that could be read is kept until the page is loaded again.
 */
export function loadRelease(): Promise<void> {
  // An answer that could not be read is asked for again the next time that the list opens.
  if (releaseStore.get()?.state === "unknown") {
    asked = null;
  }
  asked ??= latestRelease().then((downloads) => {
    releaseStore.set(downloads);
  });
  return asked;
}

/** Forget the latest release. The tests start from this state. */
export function resetRelease(): void {
  asked = null;
  releaseStore.set(null);
}
