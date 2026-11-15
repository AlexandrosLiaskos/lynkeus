import { expect, test } from "vitest";
import { CHANGE_LIMITS, LABORATORY, NEW, OFFICE, SERVERS } from "./testServers";
import {
  connectionWords,
  draftOf,
  limitRows,
  limitsFaults,
  limitsOf,
  momentWords,
  serverGroups,
  serversSentence,
  storageProblem,
} from "./words";

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
    { name: "Space for layers", value: "1.3 GB of 100 GB used" },
    { name: "Free disk space", value: "412 GB" },
  ]);
});

test("the limits are typed in gigabytes and sent in bytes", () => {
  const limits = OFFICE.state?.limits;
  expect(limits && draftOf(limits)).toEqual({ jobs: "4", storage: "100", layer: "10" });
  expect(limitsOf({ jobs: "2", storage: "250", layer: "20" })).toEqual(CHANGE_LIMITS.limits);
  expect(limitsOf({ jobs: " 1 ", storage: "0.5", layer: "0" })).toEqual({
    running_jobs: 1,
    storage: 500_000_000,
    layer_size: 0,
  });
  expect(draftOf({ running_jobs: 1, storage: 500_000_000, layer_size: 0 })).toEqual({
    jobs: "1",
    storage: "0.5",
    layer: "0",
  });
});

test("a field of the limits that holds no sound number says what to enter", () => {
  expect(limitsFaults({ jobs: "4", storage: "100", layer: "10" })).toEqual({ jobs: null, storage: null, layer: null });
  expect(limitsFaults({ jobs: "0", storage: "-1", layer: "" })).toEqual({
    jobs: "Enter a whole number of jobs from 1 to 64.",
    storage: "Enter the space in gigabytes, as a number of zero or more.",
    layer: "Enter the size in gigabytes, as a number of zero or more.",
  });
  for (const jobs of ["65", "1.5", "", "four"]) {
    expect(limitsFaults({ jobs, storage: "1", layer: "1" }).jobs).not.toBeNull();
    expect(limitsOf({ jobs, storage: "1", layer: "1" })).toBeNull();
  }
  expect(limitsOf({ jobs: "4", storage: "much", layer: "1" })).toBeNull();
  expect(limitsOf({ jobs: "4", storage: "1", layer: "Infinity" })).toBeNull();
});
