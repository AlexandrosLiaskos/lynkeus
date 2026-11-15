// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { test as base, expect, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";

/** Whether the checks open the built site of this repository, and not another address. */
const BUILT = (process.env.LYNKEUS_ADDRESS ?? "") === "";

/** The success criteria of WCAG 2.2 at the levels A and AA, as axe-core names them. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * An answer of the service limits that the page accepts. `vite preview` has no server behind /api, so the
 * checks answer in its place. The amounts are made up for the checks.
 */
const LIMITS = {
  version: "0.1.0",
  resources: { processors: 2, memory: 4_000_000_000 },
  limits: {
    larger_layer: "refused",
    layer_cells: 25_000_000,
    layer_size: 500_000_000,
    running_jobs: 1,
    waiting_jobs: 10,
    job_time: 600,
    session_unfinished_jobs: 3,
    session_layers: 20,
    session_size: 2_000_000_000,
    total_size: 20_000_000_000,
    search_products: 200,
    session_idle_time: 86_400,
    earthdata_idle_time: 3_600,
    earthdata_time: 43_200,
  },
};

/** Answer a request to /api as the server answers a visitor who has not signed in and has no layer. */
async function answer(route: Route): Promise<void> {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const json = (status: number, content: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(content) });
  if (request.method() !== "GET") {
    return json(404, { detail: "Not found." });
  }
  switch (path) {
    case "/api/session":
      return json(200, { earthdata: null });
    case "/api/limits":
      return json(200, LIMITS);
    case "/api/layers":
      return json(200, { layers: [] });
    case "/api/jobs":
      return json(200, { jobs: [], links: [] });
    case "/api/series":
      return json(200, { series: [] });
    case "/api/servers":
      return json(401, { detail: "Sign in to Earthdata to see your servers." });
    default:
      return json(404, { detail: "Not found." });
  }
}

/** The folder web of the repository, in which the configuration of Playwright stands. */
function folderOfSite(info: TestInfo): string {
  return info.config.configFile === undefined ? dirname(info.config.rootDir) : dirname(info.config.configFile);
}

/** Read the Content-Security-Policy that the web server sends with the pages of the site. */
function policyOfSite(folder: string): string {
  const found = /add_header Content-Security-Policy "(default-src 'self'[^"]*)"/.exec(
    readFileSync(join(folder, "nginx.conf"), "utf8"),
  );
  if (!found?.[1]) {
    throw new Error("The file nginx.conf states no Content-Security-Policy for the pages of the site.");
  }
  return found[1];
}

interface PolicyViolation {
  directive: string;
  blocked: string;
  source: string;
  line: number;
  /** The start of every style element of the page at that moment, to find the one that the policy refused. */
  styleElements: string[];
}

declare global {
  interface Window {
    lynkeusPolicyViolations?: PolicyViolation[];
  }
}

/**
 * What the tools find during one test: the accessibility faults of every state that the test scans, the errors
 * that the browser writes to its console, the errors that the page does not catch, the requests that fail and
 * the violations of the Content-Security-Policy. The findings are attached to the test and written to the folder
 * findings; they do not fail the test.
 */
export class Findings {
  private readonly states: { state: string; passes: number; violations: unknown[]; incomplete: unknown[] }[] = [];
  private readonly consoleErrors: { text: string; location: string }[] = [];
  private readonly pageErrors: string[] = [];
  private readonly failedRequests: { address: string; failure: string }[] = [];

  constructor(
    private readonly page: Page,
    private readonly info: TestInfo,
  ) {}

  async start(): Promise<void> {
    const { page } = this;
    page.on("console", (message) => {
      if (message.type() === "error") {
        const { url, lineNumber } = message.location();
        this.consoleErrors.push({ text: message.text(), location: `${url}:${String(lineNumber)}` });
      }
    });
    page.on("pageerror", (error) => this.pageErrors.push(error.message));
    page.on("requestfailed", (request) =>
      this.failedRequests.push({ address: request.url(), failure: request.failure()?.errorText ?? "" }),
    );
    await page.addInitScript(() => {
      const violations: PolicyViolation[] = [];
      window.lynkeusPolicyViolations = violations;
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push({
          directive: event.violatedDirective,
          blocked: event.blockedURI,
          source: event.sourceFile,
          line: event.lineNumber,
          styleElements: Array.from(document.querySelectorAll("style"), (style) => style.outerHTML.slice(0, 300)),
        });
      });
    });
    if (BUILT) {
      // `vite preview` sends no Content-Security-Policy, so the page receives the policy of nginx.conf here.
      const policy = policyOfSite(folderOfSite(this.info));
      await page.route(
        (address) => address.pathname === "/",
        async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
        },
      );
      await page.route((address) => address.pathname.startsWith("/api/"), answer);
    }
    // The checks are not visits. The counter of visits is answered here on every address, the running site
    // included, so that it does not count them.
    await page.route(
      (address) => address.pathname === "/api/visit",
      (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1 }) }),
    );
  }

  /** Scan the page as it stands with axe-core and keep the violations under the name of the state. */
  async scan(state: string): Promise<void> {
    // The scan waits until the motions that end have ended, so that it reads the colours of the settled page.
    await this.page.evaluate(async () => {
      const ending = document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined));
      await Promise.race([Promise.all(ending), new Promise((resolve) => setTimeout(resolve, 4000))]);
    });
    // The rules that axe-core could not decide (for example the contrast of a text over an image) are kept
    // too, because a person has to look at them. The number of rules that passed shows that the scan ran.
    const { passes, violations, incomplete } = await new AxeBuilder({ page: this.page }).withTags(WCAG).analyze();
    this.states.push({ state, passes: passes.length, violations, incomplete });
    await this.info.attach(`axe ${state}.json`, {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });
  }

  async finish(): Promise<void> {
    const policyViolations = await this.page.evaluate(() => window.lynkeusPolicyViolations ?? []).catch(() => null);
    const found = {
      project: this.info.project.name,
      test: this.info.title,
      status: this.info.status,
      states: this.states,
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
      failedRequests: this.failedRequests,
      policyViolations,
    };
    const text = JSON.stringify(found, null, 2);
    await this.info.attach("findings.json", { body: text, contentType: "application/json" });
    const folder = join(folderOfSite(this.info), "findings");
    mkdirSync(folder, { recursive: true });
    const name = `${this.info.project.name} ${this.info.title}`.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 150);
    writeFileSync(join(folder, `${name}.json`), text);
  }
}

export const test = base.extend<{ findings: Findings }>({
  findings: async ({ page }, use, info) => {
    const findings = new Findings(page, info);
    await findings.start();
    await use(findings);
    await findings.finish();
  },
});

export { expect };

/** Open the site and wait until the welcome screen has its image and its fonts. */
export async function openSite(page: Page): Promise<Locator> {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: /^Lynkeus/ });
  await expect(welcome).toHaveClass(/welcome-ready/);
  return welcome;
}

/** Open the site and enter through the welcome screen, until the screen has left and the map is visible. */
export async function enter(page: Page): Promise<void> {
  const welcome = await openSite(page);
  await welcome.getByRole("button", { name: "Enter the Platform" }).click();
  await expect(welcome).toBeHidden();
  await expect(page.getByRole("main", { name: "Map" })).toBeVisible();
}

/** Press a button of the ribbon: the tab, then the button, inside its group when the name is used twice. */
export async function pressTool(page: Page, tab: string, tool: string, group?: string): Promise<void> {
  await page.getByRole("tablist", { name: "Ribbon" }).getByRole("tab", { name: tab, exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: tab, exact: true });
  const within = group === undefined ? panel : panel.getByRole("group", { name: group, exact: true });
  await within.getByRole("button", { name: tool, exact: true }).click();
}

/** The pane with this title. */
export function paneOf(page: Page, title: string): Locator {
  return page.getByRole("complementary", { name: title, exact: true });
}
