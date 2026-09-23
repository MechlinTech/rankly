import { test, expect, type Page } from "@playwright/test";
import { signUpViaUI } from "./helpers";

const PUBLIC_ROUTES = ["/", "/pricing", "/security", "/privacy", "/terms", "/contact", "/login", "/signup"];
const DASHBOARD_ROUTES = ["/keywords", "/rankings", "/audit", "/crm", "/team", "/billing"];

async function assertNoBrokenImages(page: Page, route: string) {
  const brokenImages = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src)
  );
  expect(brokenImages, `Broken <img> on ${route}: ${brokenImages.join(", ")}`).toEqual([]);
}

async function assertInternalLinksResolve(page: Page, route: string) {
  const hrefs: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/") && !href.startsWith("//"))
  );

  const unique = [...new Set(hrefs)];
  for (const href of unique) {
    // OAuth start links are real <a> tags but intentionally return 501 when no
    // provider is configured (see KNOWN_LIMITATIONS.md) - that's correct,
    // documented behavior, not a broken link, so this sweep isn't the right
    // place to assert on it (that's covered in KNOWN_LIMITATIONS' manual checks).
    if (href.startsWith("/api/auth/oauth/")) continue;

    const res = await page.request.get(href, { failOnStatusCode: false });
    // 307/308 (auth redirects on protected routes) are expected and fine; only flag real breakage.
    expect([200, 307, 308], `Link ${href} found on ${route} returned ${res.status()}`).toContain(res.status());
  }
}

test.describe("broken-link and broken-image sweep — public marketing site", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} loads with no broken links or images`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const response = await page.goto(route);
      expect(response?.ok(), `${route} did not return a 2xx status`).toBe(true);

      await assertNoBrokenImages(page, route);
      await assertInternalLinksResolve(page, route);

      // Next.js HMR/websocket noise in dev is expected; only fail on real app errors.
      const realErrors = consoleErrors.filter(
        (e) => !e.includes("hmr") && !e.includes("WebSocket") && !e.includes("Fast Refresh")
      );
      expect(realErrors, `Console errors on ${route}: ${realErrors.join(" | ")}`).toEqual([]);
    });
  }
});

test.describe("broken-link and broken-image sweep — authenticated dashboard", () => {
  test("all dashboard routes load with no broken links or images", async ({ page }) => {
    await signUpViaUI(page);

    for (const route of DASHBOARD_ROUTES) {
      const response = await page.goto(route);
      expect(response?.ok(), `${route} did not return a 2xx status`).toBe(true);
      await assertNoBrokenImages(page, route);
    }
  });
});
