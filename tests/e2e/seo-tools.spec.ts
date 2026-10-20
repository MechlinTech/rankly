import { test, expect, type Page } from "@playwright/test";
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

    await expect(page.getByText(/Showing (simulated )?mock data/)).toBeVisible();
    await expect(page.getByText("local seo services", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("seed", { exact: true })).toBeVisible();
  });

  test("rank tracking shows a position for each keyword", async ({ page }) => {
    await signUpViaUI(page);
    await page.goto("/rankings");

    await page.getByPlaceholder("e.g. acme.com or https://company.com").fill("example.com");
    await page.getByPlaceholder(/Enter keywords to track/).fill("seo software\nkeyword research tool");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/seo/rankings") && res.ok()),
      page.getByRole("button", { name: "Check Rankings Now" }).click(),
    ]);

    await expect(page.getByText("Mock Engine", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /seo software/i }).first()).toBeVisible();
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
  async function createCompany(page: Page, name: string) {
    await page.goto("/crm");
    await page.getByPlaceholder("Acme Inc.").fill(name);
    await page.getByRole("button", { name: "Add company" }).click();
    const companyLink = page.getByRole("link", { name });
    await expect(companyLink).toBeVisible();
    await companyLink.click();
    await page.waitForURL("**/crm/**");
  }

  test("Add Contact shows phone validation below the field and blocks invalid saves", async ({ page }) => {
    await signUpViaUI(page);
    await createCompany(page, "Inline Validation Client");

    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Contact name").fill("Jane Doe");
    const phoneInput = page.getByLabel("Contact phone");
    const phoneField = phoneInput.locator("..");
    await phoneInput.fill("123");
    await page.getByRole("button", { name: "Add contact" }).click();

    await expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    await expect(phoneField.getByText(/7 to 15 digits/)).toBeVisible();
    await expect(page.getByText("Contact List (0)")).toBeVisible();

    await phoneInput.fill("+1 (555) 019-2834");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact List (1)")).toBeVisible();
    await expect(page.getByText("Jane Doe")).toBeVisible();
  });

  test("Add Contact renders server field errors below the matching field", async ({ page }) => {
    await signUpViaUI(page);
    await createCompany(page, "Server Error Client");

    await page.route("**/api/crm/contacts", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { formErrors: [], fieldErrors: { phone: ["The server rejected this phone number."] } },
        }),
      });
    });

    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Contact name").fill("Jane Doe");
    const phoneInput = page.getByLabel("Contact phone");
    const phoneField = phoneInput.locator("..");
    await phoneInput.fill("+1 (555) 019-2834");
    await page.getByRole("button", { name: "Add contact" }).click();

    await expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    await expect(phoneField.getByText("The server rejected this phone number.")).toBeVisible();
    await expect(page.getByText("Couldn't add contact. Please review fields.")).toHaveCount(0);

    await page.unroute("**/api/crm/contacts");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact List (1)")).toBeVisible();
    await expect(page.getByText("Jane Doe")).toBeVisible();
  });

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
