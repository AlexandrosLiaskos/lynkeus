import { expect, test } from "vitest";
import { REPOSITORY, type Downloads } from "./downloads";
import { CHANGE_LIMITS, LABORATORY, NEW, OFFICE, SERVERS } from "./testServers";
import {
  cellsMemoryWords,
  cellsOf,
  connectionWords,
  draftOf,
  limitRows,
  limitsFaults,
  limitsOf,
  momentWords,
  OLDER_PROGRAM,
  serverGroups,
  serversSentence,
  storageProblem,
  upgradeOf,
  upgradeWords,
} from "./words";

const FILES = `https://github.com/${REPOSITORY}/releases/download/v0.1.0`;
/** The line of the memory for the 100 million cells and the 16 GB of the Office computer. */
const MEMORY_100 =
  "A job that receives a layer of 100 million cells needs about 1.7 GB of memory. The 16 GB of this computer allow 9 such jobs at the same time.";

function rows(groups: ReturnType<typeof serverGroups>): Record<string, string[]> {
  return Object.fromEntries(
    groups.map(({ title, rows: part }) => [
      title ?? "",
      part.map(({ name, value }) => `${name}: ${typeof value === "string" ? value : ""}`),
    ]),
  );
}

test("a time in seconds is written as a date and a time in UTC", () => {
  expect(momentWords(1794735612.5)).toBe("15 Nov 2026, 09:40:12 UTC");
  expect(momentWords(0)).toBe("1 Jan 1970, 00:00:00 UTC");
});

test("a server says whether it is connected, and since when it is not", () => {
  expect(connectionWords(OFFICE)).toBe("Connected");
  expect(connectionWords(LABORATORY)).toBe("Not connected since 14 Nov 2026, 18:05:40 UTC");
  expect(connectionWords(NEW)).toBe("Not connected yet");
  expect(connectionWords({ ...NEW, connected: true })).toBe("Connected");
});

test("the line of the list counts the servers that are connected and names the most of one account", () => {
  expect(serversSentence(SERVERS.servers, SERVERS.limit)).toBe(
    "1 of your 3 servers are connected. One Earthdata account connects at most 8 servers.",
  );
  expect(serversSentence([OFFICE], 8)).toBe(
    "Your server is connected. One Earthdata account connects at most 8 servers.",
  );
  expect(serversSentence([LABORATORY], 1)).toBe(
    "Your server is not connected. One Earthdata account connects at most 1 server.",
  );
});

test("a server reports its computer, its jobs, its layers and disk, and its connection", () => {
  expect(rows(serverGroups(OFFICE))).toEqual({
    Computer: ["System: Windows 11", "Lynkeus Server: Version 0.1.0", "Processors: 20", "Memory: 16 GB"],
    Jobs: ["Running: 1 of at most 4", "Waiting: 2"],
    "Layers and disk": [
      "Layers kept: 6",
      "Space used by layers: 1.3 GB of at most 100 GB",
      "Largest layer allowed: 10 GB",
      "Most cells of a layer: 100 million",
      "Free disk space: 412 GB",
    ],
    Connection: [
      "Connected to your account: 15 Nov 2026, 08:00:00 UTC",
      "Last message: 15 Nov 2026, 09:40:12 UTC",
      "Identifier: 3f9a1c0b7e24d658",
    ],
  });
});

test("a memory that the server could not read is said to be unknown", () => {
  expect(rows(serverGroups(LABORATORY)).Computer).toContain("Memory: Not known");
});

test("a server that has not reported yet shows its connection alone", () => {
  expect(rows(serverGroups(NEW))).toEqual({
    Connection: ["Connected to your account: 15 Nov 2026, 09:39:00 UTC", "Identifier: 0c6b7d1e94a2f853"],
  });
});

test("a server whose layers use the space of its limit, or whose disk is full, says so", () => {
  expect(storageProblem(OFFICE.name, OFFICE.state)).toBeNull();
  expect(storageProblem(NEW.name, NEW.state)).toBeNull();
  expect(storageProblem(LABORATORY.name, LABORATORY.state)).toBe(
    'The layers of the server "Laboratory server" use 50 GB, and its limit allows 50 GB. Remove layers of that server or raise its limit before a job that makes a layer is started there.',
  );
  const state = OFFICE.state;
  expect(state && storageProblem("Office computer", { ...state, disk_free: 0 })).toBe(
    'The disk of the server "Office computer" has no free space. Free space on that computer before a job that makes a layer is started there.',
  );
});

test("a form shows the limits of a server with its present use", () => {
  expect(OFFICE.state && limitRows(OFFICE.state)).toEqual([
    { name: "Jobs at the same time", value: "4 (1 running, 2 waiting)" },
    { name: "Largest layer", value: "10 GB" },
    { name: "Most cells of a layer", value: "100 million" },
    { name: "Space for layers", value: "1.3 GB of 100 GB used" },
    { name: "Free disk space", value: "412 GB" },
  ]);
  // The older program does not state the cells of a layer: they count as 25 million.
  expect(LABORATORY.state && limitRows(LABORATORY.state)[2]).toEqual({
    name: "Most cells of a layer",
    value: "25 million",
  });
});

test("the limits are typed in gigabytes and in million cells, and sent in bytes and in cells", () => {
  const limits = OFFICE.state?.limits;
  expect(limits && draftOf(limits)).toEqual({ jobs: "4", storage: "100", layer: "10", cells: "100" });
  expect(limitsOf({ jobs: "2", storage: "250", layer: "20", cells: "150" })).toEqual(CHANGE_LIMITS.limits);
  expect(limitsOf({ jobs: " 1 ", storage: "0.5", layer: "0", cells: " 37.5 " })).toEqual({
    running_jobs: 1,
    storage: 500_000_000,
    layer_size: 0,
    layer_cells: 37_500_000,
  });
  // Limits that do not state the cells of a layer show the 25 million that hold for them.
  expect(draftOf({ running_jobs: 1, storage: 500_000_000, layer_size: 0 })).toEqual({
    jobs: "1",
    storage: "0.5",
    layer: "0",
    cells: "25",
  });
});

const SOUND = { jobs: "4", storage: "100", layer: "10", cells: "100" };

test("a field of the limits that holds no sound number says what to enter", () => {
  expect(limitsFaults(SOUND)).toEqual({ jobs: null, storage: null, layer: null, cells: null });
  expect(limitsFaults({ jobs: "0", storage: "-1", layer: "", cells: "0.5" })).toEqual({
    jobs: "Enter a whole number of jobs from 1 to 64.",
    storage: "Enter the space in gigabytes, as a number of zero or more.",
    layer: "Enter the size in gigabytes, as a number of zero or more.",
    cells: "Enter the cells in millions, as a number from 1 to 4,000.",
  });
  for (const jobs of ["65", "1.5", "", "four"]) {
    expect(limitsFaults({ ...SOUND, jobs }).jobs).not.toBeNull();
    expect(limitsOf({ ...SOUND, jobs })).toBeNull();
  }
  expect(limitsOf({ ...SOUND, storage: "much" })).toBeNull();
  expect(limitsOf({ ...SOUND, layer: "Infinity" })).toBeNull();
  for (const cells of ["", "many", "0", "0.9", "4001", "-25"]) {
    expect(limitsFaults({ ...SOUND, cells }).cells).not.toBeNull();
    expect(limitsOf({ ...SOUND, cells })).toBeNull();
  }
  expect(cellsOf("1")).toBe(1_000_000);
  expect(cellsOf("4000")).toBe(4_000_000_000);
  expect(cellsOf("25.4")).toBe(25_400_000);
});

test("the line under the cells says what memory a job of that size needs and how many the computer allows", () => {
  expect(cellsMemoryWords(100_000_000, 17_179_869_184)).toBe(MEMORY_100);
  expect(cellsMemoryWords(25_000_000, null)).toBe(
    "A job that receives a layer of 25 million cells needs about 572.2 MB of memory. The memory of this computer is not known.",
  );
  expect(cellsMemoryWords(4_000_000_000, 17_179_869_184)).toBe(
    "A job that receives a layer of 4 billion cells needs about 59.8 GB of memory. The 16 GB of this computer do not allow such a job.",
  );
  expect(cellsMemoryWords(1_000_000_000, 17_179_869_184)).toMatch(/allow 1 such job at the same time\.$/);
});

const RELEASE: Downloads = {
  state: "published",
  release: {
    version: "v0.1.0",
    published: "2026-11-15T12:00:00Z",
    downloads: [
      { system: "windows", name: "Lynkeus-Server-0.1.0-Windows.exe", address: `${FILES}/Lynkeus-Server-0.1.0-Windows.exe`, size: 83_300_000 },
      { system: "linux", name: "Lynkeus-Server-0.1.0-Linux.tar.gz", address: `${FILES}/Lynkeus-Server-0.1.0-Linux.tar.gz`, size: 121_900_000 },
    ],
  },
};
const WINDOWS_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAC_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_1) AppleWebKit/605.1.15";

test("a server whose last report lacked the cells of a layer is offered the file for the computer of the visitor", () => {
  expect(OLDER_PROGRAM).toBe(
    "This server runs an older Lynkeus Server, which receives at most 25 million cells of one layer.",
  );
  // The Laboratory server runs the older program on Ubuntu, and the visitor reads the page on Windows.
  expect(upgradeOf(LABORATORY, RELEASE, WINDOWS_AGENT)).toEqual({
    state: "download",
    download: RELEASE.release.downloads[0],
  });
  // A release without a file for the system of the visitor, and an answer of GitHub that could not be read,
  // lead to the page of the releases.
  expect(upgradeOf(LABORATORY, RELEASE, MAC_AGENT)).toEqual({ state: "page" });
  expect(upgradeOf(LABORATORY, { state: "unknown" }, WINDOWS_AGENT)).toEqual({ state: "page" });
});

test("without a published release the notice of the older program says so in plain words", () => {
  expect(upgradeOf(LABORATORY, { state: "none" }, WINDOWS_AGENT)).toEqual({ state: "none" });
  expect(upgradeWords({ state: "none" })).toBe(
    "No version of Lynkeus Server is published yet, so there is nothing to download.",
  );
  expect(upgradeOf(LABORATORY, null, WINDOWS_AGENT)).toEqual({ state: "asking" });
  expect(upgradeWords({ state: "asking" })).toBe("Asking GitHub for the latest version of Lynkeus Server.");
});

test("a server that knows the cells of a layer, or that has not reported yet, is offered nothing, whatever its version", () => {
  // The older and the newer program carry the same version.
  expect(OFFICE.state?.version).toBe(LABORATORY.state?.version);
  expect(upgradeOf(OFFICE, RELEASE, WINDOWS_AGENT)).toBeNull();
  // Before its first report the project server says that a server does not know the cells; the pane says nothing.
  expect(NEW.knows_cells).toBe(false);
  expect(upgradeOf(NEW, RELEASE, WINDOWS_AGENT)).toBeNull();
  // The member of the project server decides, and not the limits that the report shows.
  expect(upgradeOf({ ...LABORATORY, knows_cells: true }, RELEASE, WINDOWS_AGENT)).toBeNull();
  expect(upgradeOf({ ...OFFICE, knows_cells: false }, RELEASE, WINDOWS_AGENT)?.state).toBe("download");
});
