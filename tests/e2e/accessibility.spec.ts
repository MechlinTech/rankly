import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signUpViaUI } from "./helpers";

// WCAG 2.2 AA basics via axe-core, on a real rendered page - not a style-guide
// check, an actual accessibility-tree analysis of what ships. Only fails on
// "serious"/"critical" violations: axe's "moderate"/"minor" set includes some
// judgment-call rules not worth gating a build on.
const SERIOUS_IMPACTS = ["serious", "critical"];

const PUBLIC_ROUTES = ["/", "/pricing", "/security", "/login", "/signup"];
const DASHBOARD_ROUTES = ["/keywords", "/rankings", "/team", "/billing"];

test.describe("accessibility (axe-core, WCAG 2.2 AA)", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no serious/critical WCAG violations`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();

      const serious = results.violations.filter((v) => SERIOUS_IMPACTS.includes(v.impact ?? ""));
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }

  test("dashboard routes have no serious/critical WCAG violations", async ({ page }) => {
    await signUpViaUI(page);

    for (const route of DASHBOARD_ROUTES) {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();

      const serious = results.violations.filter((v) => SERIOUS_IMPACTS.includes(v.impact ?? ""));
      expect(serious, `${route}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });
});
