import { afterEach, expect, test, vi } from "vitest";
import {
  isLater,
  latestRelease,
  latestReleaseAddress,
  loadRelease,
  releaseOf,
  releasesPage,
  releaseStore,
  REPOSITORY,
  resetRelease,
  systemOfAgent,
  systemOfName,
  systemOfServer,
} from "./downloads";
import real from "./testdata/release-cli.json";
import { RELEASE, site } from "./testServers";

afterEach(() => {
  resetRelease();
  vi.unstubAllGlobals();
});

test("the addresses are those of the repository of Lynkeus on GitHub", () => {
  expect(latestReleaseAddress(REPOSITORY)).toBe(
    "https://api.github.com/repos/AlexandrosLiaskos/lynkeus/releases/latest",
  );
  expect(releasesPage(REPOSITORY)).toBe("https://github.com/AlexandrosLiaskos/lynkeus/releases");
});

// The answer of GitHub for the latest release of the repository cli/cli, received on 15 November 2026 and cut
// down to the fields that the page reads and a few beside them. It shows the form of a real answer.
test("a real answer of GitHub is read: its version, its date, and no file under the names of Lynkeus Server", () => {
  expect(releaseOf(real, "cli/cli")).toEqual({
    version: "v2.104.0",
    published: "2026-11-12T19:03:51Z",
    downloads: [],
  });
  expect(real.assets).toHaveLength(22);
  expect(
    real.assets.every(({ browser_download_url: address, name }) =>
      address.startsWith(`https://github.com/cli/cli/releases/download/${real.tag_name}/${name}`),
    ),
  ).toBe(true);
});

test("the files of Lynkeus Server are found by their names and listed in the order of the systems", () => {
  const release = releaseOf(RELEASE, REPOSITORY);
  expect(release?.version).toBe("v0.2.0");
  expect(release?.downloads).toEqual([
    {
      system: "windows",
      name: "Lynkeus-Server-0.2.0-Windows.exe",
      address: "https://github.com/AlexandrosLiaskos/lynkeus/releases/download/v0.2.0/Lynkeus-Server-0.2.0-Windows.exe",
      size: 76_500_000,
    },
    {
      system: "macos",
      name: "Lynkeus-Server-0.2.0-macOS.dmg",
      address: "https://github.com/AlexandrosLiaskos/lynkeus/releases/download/v0.2.0/Lynkeus-Server-0.2.0-macOS.dmg",
      size: 79_900_000,
    },
    {
      system: "linux",
      name: "Lynkeus-Server-0.2.0-Linux.tar.gz",
      address:
        "https://github.com/AlexandrosLiaskos/lynkeus/releases/download/v0.2.0/Lynkeus-Server-0.2.0-Linux.tar.gz",
      size: 81_200_000,
    },
  ]);
});

test("a file whose address is not a release file of the repository is left out", () => {
  const [asset] = RELEASE.assets;
  const elsewhere = { ...asset, browser_download_url: `https://example.org/${asset?.name ?? ""}` };
  expect(releaseOf({ ...RELEASE, assets: [elsewhere, null, { name: 5 }] }, REPOSITORY)?.downloads).toEqual([]);
  expect(releaseOf(RELEASE, "another/repository")?.downloads).toEqual([]);
});

test("an answer of another form is no release", () => {
  expect(releaseOf(null, REPOSITORY)).toBeNull();
  expect(releaseOf({ tag_name: "", assets: [] }, REPOSITORY)).toBeNull();
  expect(releaseOf({ tag_name: "v0.2.0" }, REPOSITORY)).toBeNull();
  expect(releaseOf({ tag_name: "v0.2.0", assets: [], published_at: "soon" }, REPOSITORY)?.published).toBeNull();
});

test("the name of a file tells its system", () => {
  expect(systemOfName("Lynkeus-Server-0.1.0-Windows.exe")).toBe("windows");
  expect(systemOfName("Lynkeus-Server-0.1.0-macOS.dmg")).toBe("macos");
  expect(systemOfName("Lynkeus-Server-0.1.0-Linux.tar.gz")).toBe("linux");
  expect(systemOfName("Lynkeus-Server-0.1.0-Windows.exe.sha256")).toBeNull();
  expect(systemOfName("Lynkeus-Server--Windows.exe")).toBeNull();
  expect(systemOfName("lynkeus-server-0.1.0-windows.exe")).toBeNull();
  expect(systemOfName("Source code (zip)")).toBeNull();
});

test("the browser tells the system of the computer, and a telephone tells none", () => {
  const agent = (system: string) => `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0`;
  expect(systemOfAgent(agent("Windows NT 10.0; Win64; x64"))).toBe("windows");
  expect(systemOfAgent(agent("Macintosh; Intel Mac OS X 10_15_7"))).toBe("macos");
  expect(systemOfAgent(agent("X11; Linux x86_64"))).toBe("linux");
  expect(systemOfAgent(agent("Linux; Android 16; Pixel 9"))).toBeNull();
  expect(systemOfAgent(agent("iPhone; CPU iPhone OS 19_0 like Mac OS X"))).toBeNull();
  expect(systemOfAgent("")).toBeNull();
});

test("a repository without a release is told apart from an answer that cannot be read", async () => {
  const server = site();
  expect(await latestRelease()).toEqual({ state: "none" });
  const [request] = server.received;
  expect(request?.address).toBe("https://api.github.com/repos/AlexandrosLiaskos/lynkeus/releases/latest");
  expect(server.fetch.mock.calls[0]?.[1]).toEqual({
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  server.release = { status: 403, content: { message: "API rate limit exceeded" } };
  expect(await latestRelease()).toEqual({ state: "unknown" });
  server.release = { status: 200, content: { message: "another form" } };
  expect(await latestRelease()).toEqual({ state: "unknown" });
  server.release = null;
  expect(await latestRelease()).toEqual({ state: "unknown" });
});

test("a published release gives its downloads", async () => {
  const server = site();
  server.release = { status: 200, content: RELEASE };
  const downloads = await latestRelease();
  expect(downloads.state).toBe("published");
  expect(downloads.state === "published" ? downloads.release.downloads.map(({ system }) => system) : []).toEqual([
    "windows",
    "macos",
    "linux",
  ]);
});

test("the name of the system that a server reports tells the download for its computer", () => {
  expect(systemOfServer("Windows 11")).toBe("windows");
  expect(systemOfServer("macOS 15.1")).toBe("macos");
  expect(systemOfServer("Ubuntu 24.04.1 LTS")).toBe("linux");
  expect(systemOfServer("Debian GNU/Linux 13 (trixie)")).toBe("linux");
  expect(systemOfServer("Linux 6.8.0")).toBe("linux");
  expect(systemOfServer("Unknown system")).toBeNull();
});

test("a release is later than a version of Lynkeus Server by its numbers", () => {
  expect(isLater("v0.2.0", "0.1.0")).toBe(true);
  expect(isLater("0.1.1", "0.1.0")).toBe(true);
  expect(isLater("v1.0", "0.9.9")).toBe(true);
  expect(isLater("v0.10.0", "0.9.0")).toBe(true);
  expect(isLater("v0.1.0", "0.1.0")).toBe(false);
  expect(isLater("v0.1.0", "0.2.0")).toBe(false);
  expect(isLater("latest", "0.1.0")).toBe(false);
  expect(isLater("v0.2.0-beta", "0.1.0")).toBe(false);
});

test("the list of the servers asks GitHub once, and again only after an answer that could not be read", async () => {
  const server = site();
  server.release = { status: 200, content: RELEASE };
  expect(releaseStore.get()).toBeNull();
  await Promise.all([loadRelease(), loadRelease()]);
  await loadRelease();
  expect(server.sent("GET", latestReleaseAddress(REPOSITORY))).toHaveLength(1);
  expect(releaseStore.get()).toMatchObject({ state: "published", release: { version: "v0.2.0" } });
  resetRelease();
  server.release = { status: 500, content: {} };
  await loadRelease();
  expect(releaseStore.get()).toEqual({ state: "unknown" });
  server.release = { status: 200, content: RELEASE };
  await loadRelease();
  expect(releaseStore.get()?.state).toBe("published");
  expect(server.sent("GET", latestReleaseAddress(REPOSITORY))).toHaveLength(3);
});
