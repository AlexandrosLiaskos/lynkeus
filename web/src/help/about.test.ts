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

test("the statements taken from README.md stand in README.md", () => {
  const readme = text("README.md");
  expect(readme).toContain(ABOUT.purpose);
  expect(readme).toContain(ABOUT.independence);
  expect(readme).toContain(`It is developed by ${ABOUT.team}`);
  expect(readme).toContain(`Team log, with every decision and its reasons: <${ABOUT.teamLog}>`);
  expect(readme).toContain(ABOUT.cite);
});

test("the statements taken from NOTICE stand in NOTICE", () => {
  const notice = text("NOTICE");
  expect(notice).toContain(ABOUT.copyright);
  expect(notice).toContain(ABOUT.licence);
});

test("the citation shows the fields of CITATION.cff", () => {
  expect(field("title")).toBe(ABOUT.citation.title);
  expect(`${field("given-names") ?? ""} ${field("family-names") ?? ""}`).toBe(ABOUT.citation.author);
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

test("the page of the application keeps the bookmarks in the browser and nothing else", () => {
  const storage = /localStorage|sessionStorage|indexedDB|document\.cookie|cookieStore/;
  const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter(
    (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
  );
  // Another file named here keeps something in the browser: the dialog About must then say so, in `about.ts`.
  expect(files.filter((name) => storage.test(readFileSync(`src/${name}`, "utf8")))).toEqual(["map/bookmarks.ts"]);
  const bookmarks = readFileSync("src/map/bookmarks.ts", "utf8");
  expect(bookmarks).toContain("/** A view of the map that the user has saved under a name. */");
  expect(bookmarks.match(/\.setItem\(.*$/gm)).toEqual([".setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));"]);
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
