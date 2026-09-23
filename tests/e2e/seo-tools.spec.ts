import { test, expect } from "@playwright/test";
import { signUpViaUI } from "./helpers";

test.describe("SEO tools (real browser, real DB)", () => {
  test("keyword research shows mock-data notice and a results table", async ({ page }) => {
    await signUpViaUI(page);
    await page.goto("/keywords");

    await page.getByPlaceholder("e.g. project management software").fill("local seo services");
    // Wait for the actual API response rather than a fixed assertion timeout -
    // avoids a race against the mock provider's response landing.
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/seo/keywords") && res.ok()),
      page.getByRole("button", { name: "Research" }).click(),
    ]);

    await expect(page.getByText("Showing mock data")).toBeVisible();
    await expect(page.getByText("local seo services", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("seed", { exact: true })).toBeVisible();
  });

  test("rank tracking shows a position for each keyword", async ({ page }) => {
    await signUpViaUI(page);
    await page.goto("/rankings");

    await page.getByPlaceholder("example.com").fill("example.com");
    await page.getByPlaceholder(/seo software/).fill("seo software\nkeyword research tool");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/seo/rankings") && res.ok()),
      page.getByRole("button", { name: "Check Rankings" }).click(),
    ]);

    await expect(page.getByText("Showing mock data")).toBeVisible();
    await expect(page.getByRole("cell", { name: "seo software" })).toBeVisible();
  });

  test("site audit runs a real crawl against example.com and reports real issues", async ({ page }) => {
    await signUpViaUI(page);
    await page.goto("/audit");

    await page.getByPlaceholder("example.com").fill("example.com");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/seo/audit") && res.ok(), { timeout: 15_000 }),
      page.getByRole("button", { name: "Run Audit" }).click(),
    ]);

    await expect(page.getByText(/Crawled \d+ page/)).toBeVisible();
    // example.com is known to be missing a meta description - a real crawl finding, not a fixture.
    await expect(page.getByText("Missing meta description.")).toBeVisible();
  });
});

test.describe("CRM (real browser, real DB)", () => {
  test("creating a company, adding a note, and changing its stage all persist", async ({ page }) => {
    await signUpViaUI(page);
    await page.goto("/crm");

    await page.getByPlaceholder("Acme Inc.").fill("Playwright Test Client");
    await page.getByRole("button", { name: "Add company" }).click();

    const companyLink = page.getByRole("link", { name: "Playwright Test Client" });
    await expect(companyLink).toBeVisible();
    await companyLink.click();

    await page.waitForURL("**/crm/**");
    await expect(page.getByRole("heading", { name: "Playwright Test Client" })).toBeVisible();

    await page.getByPlaceholder("Add a note…").fill("First contact made via LinkedIn.");
    await page.getByRole("button", { name: "Add" }).first().click();
    await expect(page.getByText("First contact made via LinkedIn.")).toBeVisible();

    await page.getByRole("combobox").selectOption("CLIENT");
    await expect(page.getByText("Stage changed from LEAD to CLIENT")).toBeVisible();
  });
});

test.describe("Team (real browser, real DB)", () => {
  test("a FREE-plan tenant sees the entitlement error when inviting a 2nd member", async ({ page }) => {
    await signUpViaUI(page);
    await page.goto("/team");

    await page.getByPlaceholder("teammate@company.com").fill("second-member@e2e-test.local");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText(/Free plan allows up to 1 team member/)).toBeVisible();
  });
});
