// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { version } from "../../package.json";
import { ABOUT } from "./about";

/**
 * A text of the repository, with every run of white space as one space, because a sentence of a text may run over
 * two lines, and without the marks of a Markdown link.
 */
function text(path: string): string {
  return readFileSync(`../${path}`, "utf8")
    .replace(/\s+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/** The value of a field of CITATION.cff, without its quotation marks. */
function field(name: string): string | undefined {
  return new RegExp(`^[ -]*${name}: "?([^"\\n]+)"?$`, "m").exec(readFileSync("../CITATION.cff", "utf8"))?.[1];
}

/** The authors of CITATION.cff, in their order: a person by the given and the family names, an entity by its name. */
function authors(): string[] {
  const list = /^authors:\n((?: .*\n)+)/m.exec(readFileSync("../CITATION.cff", "utf8"))?.[1] ?? "";
  return list
    .split(/^ {2}- /m)
    .filter((author) => author !== "")
    .map((author) => {
      const value = (name: string) => new RegExp(`^ *${name}: "?([^"\\n]+)"?$`, "m").exec(author)?.[1];
      return value("name") ?? `${value("given-names") ?? ""} ${value("family-names") ?? ""}`;
    });
}

test("the statements taken from README.md stand in README.md", () => {
  const readme = text("README.md");
  expect(readme).toContain(ABOUT.purpose);
  expect(readme).toContain(ABOUT.independence);
  expect(readme).toContain(`It is developed by ${ABOUT.team}`);
  expect(readme).toContain(`Team log, with every decision and its reasons: <${ABOUT.teamLog}>`);
  expect(readme).toContain(ABOUT.cite);
  expect(readme).toContain(ABOUT.terms);
});

test("the notices of the licence are those of NOTICE, word for word and in its order", () => {
  const notice = text("NOTICE");
  // NOTICE opens with the name, the copyright, the licence and the warranty.
  expect(notice.startsWith(`Lynkeus ${ABOUT.copyright} ${ABOUT.licence} ${ABOUT.warranty} `)).toBe(true);
  // The attribution is the whole of its section: the two lines between its heading and the additional terms.
  expect(notice).toContain(` Attribution ${ABOUT.attribution.join(" ")} Additional terms under section 7 `);
  // The first additional term names the dialog About as the place of the attribution in Lynkeus.
  expect(notice).toContain("in its Appropriate Legal Notices (in Lynkeus, the About dialog)");
});

test("the dialog links to the files LICENSE and NOTICE of the repository", () => {
  expect(ABOUT.licenceFile).toBe(`${ABOUT.citation.repository}/blob/main/LICENSE`);
  expect(ABOUT.noticeFile).toBe(`${ABOUT.citation.repository}/blob/main/NOTICE`);
  expect(text("LICENSE").startsWith(" GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007 ")).toBe(true);
  expect(text("NOTICE")).toContain("in the file LICENSE.");
});

test("the citation shows the fields of CITATION.cff", () => {
  expect(field("title")).toBe(ABOUT.citation.title);
  expect(authors()).toEqual(ABOUT.citation.authors);
  expect(field("url")).toBe(ABOUT.citation.site);
  expect(field("repository-code")).toBe(ABOUT.citation.repository);
  expect(field("license")).toBe(ABOUT.citation.licence);
});

test("the version shown is the version of the citation entry, of the server package and of the server", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(field("version")).toBe(version);
  expect(/^version = "([^"]+)"$/m.exec(readFileSync("../api/pyproject.toml", "utf8"))?.[1]).toBe(version);
  expect(/^__version__ = "([^"]+)"$/m.exec(readFileSync("../api/src/lynkeus/__init__.py", "utf8"))?.[1]).toBe(version);
});

test("the page of the application keeps in the browser the parts of the work that the dialog names, and nothing else", () => {
  const storage = /localStorage|sessionStorage|indexedDB|document\.cookie|cookieStore/;
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((name) => name.replaceAll("\\", "/"))
    // The set-up of the tests is no file of the page: it empties the storage before each test.
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "test-setup.ts")
    .sort();
  const read = (name: string) => readFileSync(`src/${name}`, "utf8");
  // One file reaches the storage of the browser, and it stores only what a part declares and its own options.
  expect(files.filter((name) => storage.test(read(name)))).toEqual(["shared/storage/storage.ts"]);
  // Another file named here keeps something in the browser: the dialog About must then say so, in `about.ts`.
  const owners = files.filter((name) => /\bkeepInBrowser</.test(read(name)) && name !== "shared/storage/storage.ts");
  expect(owners).toEqual([
    "contents/storedLayers.ts",
    "data/storedSearch.ts",
    "map/bookmarks.ts",
    "map/storedView.ts",
    "shared/area.ts",
    "view/storedPanes.ts",
    "welcome/visits.ts",
  ]);
  const keys = owners.map((name) => /"(lynkeus\.[a-z]+)"/.exec(read(name))?.[1]);
  expect(keys).toEqual([
    "lynkeus.layers",
    "lynkeus.search",
    "lynkeus.bookmarks",
    "lynkeus.view",
    "lynkeus.area",
    "lynkeus.panes",
    "lynkeus.visit",
  ]);
  for (const part of [
    "bookmarks",
    "view of the map",
    "panes",
    "area",
    "form of the search",
    "layers of the map",
    "marker of a counted visit",
  ]) {
    expect(ABOUT.applicationStores).toContain(`the ${part}`);
  }
  expect(readFileSync("index.html", "utf8")).not.toContain("visits.js");
});

test("the web service describes a session, creates it and removes it as the dialog says", () => {
  const sessions = readFileSync("../api/src/lynkeus/sessions.py", "utf8");
  expect(text("api/src/lynkeus/sessions.py")).toContain(ABOUT.session);
  expect(sessions).toContain(
    'SESSION_IDLE_TIME = 7 * 24 * 3600.0\n"""The time without use after which a session is removed with its jobs and layers, in seconds."""',
  );
  // The three addresses that create a session: the state of the session, the sign-in and the start of a job.
  const routes = readFileSync("../api/src/lynkeus/routes.py", "utf8");
  expect(routes.match(/_session_or_new\(request\)/g)).toHaveLength(3);
  expect(routes).toContain(
    "Report whether the visitor is signed in to Earthdata, and create the session when there is none.",
  );
  expect(routes).toContain('"""Sign the visitor in to Earthdata with a user token."""');
  expect(routes).toContain("service.jobs.submit(_session_or_new(request), process, inputs, form, token)");
});

test("the page of the team log says of itself what the dialog says of it, and its script and its server do so", () => {
  expect(text("api/src/lynkeus/team_log.py")).toContain(
    ABOUT.teamLogStores.replace("The page of the team log", "This page"),
  );
  // The script of the page writes one marker, and the server writes the total and nothing else.
  expect(readFileSync("public/assets/visits.js", "utf8").match(/\.setItem\(/g)).toHaveLength(1);
  expect(readFileSync("../api/src/lynkeus/visits.py", "utf8").match(/\.write_text\(.*$/gm)).toEqual([
    '.write_text(json.dumps({"count": count}), encoding="utf-8")',
  ]);
});

test("the web server turns its request log off for the counter of visits only", () => {
  const settings = readFileSync("nginx.conf", "utf8");
  expect(settings.match(/^\s*access_log\b.*$/gm)?.map((line) => line.trim())).toEqual(["access_log off;"]);
  expect(/location = \/api\/visit \{\s*access_log off;/.test(settings)).toBe(true);
});
