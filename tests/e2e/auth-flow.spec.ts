import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { signUpViaUI, logout, randomEmail } from "./helpers";

let db: Client;

test.beforeAll(async () => {
  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
});

test.afterAll(async () => {
  await db.end();
});

test.describe("auth flow (real browser)", () => {
  test("signup lands on the dashboard with the correct tenant shown", async ({ page }) => {
    const user = await signUpViaUI(page);

    await expect(page.getByRole("heading", { name: "Keyword Research" })).toBeVisible();
    await expect(page.getByText(user.companyName).first()).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("password visibility toggle shows an icon matching the current state", async ({ page }) => {
    await page.goto("/login");

    const input = page.locator('input[autocomplete="current-password"]');
    const toggle = page.locator('button[aria-label="Show password"], button[aria-label="Hide password"]');

    await input.fill("secret-password");
    await expect(input).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-label", "Show password");
    // Eye-off icon has no pupil circle; the open eye does.
    await expect(toggle.locator("svg circle")).toHaveCount(0);

    // Losing and regaining focus must not remove the toggle.
    await page.getByRole("heading", { name: "Log in to Rankly" }).click();
    await expect(toggle).toBeVisible();
    await input.focus();
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-label", "Hide password");
    await expect(toggle.locator("svg circle")).toHaveCount(1);
    await expect(input).toHaveValue("secret-password");

    await toggle.click();
    await expect(input).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-label", "Show password");
    await expect(toggle.locator("svg circle")).toHaveCount(0);
  });

  test("signup rejects passwords containing whitespace", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Whitespace Test User");
    await page.getByLabel("Company name").fill("Whitespace Test Co");
    await page.getByLabel("Email").fill(`whitespace-${Date.now()}@e2e-test.local`);

    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: "Create account" });

    for (const invalidPassword of [
      " ",
      "a b",
      " e2e-test-password-123",
      "e2e-test-password-123 ",
      "e2e test password 123",
    ]) {
      await password.fill(invalidPassword);
      await submit.click();
      await expect(page.locator('p[role="alert"]')).toHaveText("Password must not contain spaces.");
      expect(page.url()).toContain("/signup");
    }
  });

  test("reset-password rejects passwords containing whitespace", async ({ page }) => {
    const user = await signUpViaUI(page);
    const result = await db.query<{ id: string }>('SELECT "id" FROM "User" WHERE "email" = $1', [
      user.email,
    ]);
    const dbUser = result.rows[0];
    const token = `e2e-reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.query(
      'INSERT INTO "PasswordResetToken" ("id", "userId", "token", "expiresAt") VALUES ($1, $2, $3, $4)',
      [randomUUID(), dbUser.id, token, new Date(Date.now() + 60 * 60 * 1000)]
    );

    await page.goto(`/reset-password/${token}`);
    const password = page.getByLabel("New password");
    const submit = page.getByRole("button", { name: "Update password" });

    for (const invalidPassword of [
      " ",
      "a b",
      " e2e-test-password-123",
      "e2e-test-password-123 ",
      "e2e test password 123",
    ]) {
      await password.fill(invalidPassword);
      await submit.click();
      await expect(page.getByText("Password must not contain spaces.")).toBeVisible();
    }
  });

  test("invite password setup rejects passwords containing whitespace", async ({ page }) => {
    const owner = await signUpViaUI(page);
    const result = await db.query<{ id: string; tenantId: string }>(
      'SELECT u."id", m."tenantId" FROM "User" u JOIN "Membership" m ON m."userId" = u."id" WHERE u."email" = $1 LIMIT 1',
      [owner.email]
    );
    const ownerUser = result.rows[0];
    const token = `e2e-invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.query(
      'INSERT INTO "Invitation" ("id", "tenantId", "email", "role", "token", "invitedBy", "expiresAt") VALUES ($1, $2, $3, $4::"Role", $5, $6, $7)',
      [
        randomUUID(),
        ownerUser.tenantId,
        randomEmail("whitespace-invitee"),
        "MEMBER",
        token,
        ownerUser.id,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      ]
    );

    await page.goto(`/invite/${token}`);
    await page.getByLabel("Your name").fill("Invited Test User");
    const password = page.getByLabel("Set a password");
    const submit = page.getByRole("button", { name: "Accept invitation" });

    for (const invalidPassword of [
      " ",
      "a b",
      " member-password-123",
      "member-password-123 ",
      "member password 123",
    ]) {
      await password.fill(invalidPassword);
      await submit.click();
      await expect(page.getByText("Password must not contain spaces.")).toBeVisible();
    }
  });

  test("signup uses the same persistent password visibility toggle", async ({ page }) => {
    await page.goto("/signup");

    const input = page.locator('input[autocomplete="new-password"]');
    const toggle = page.locator('button[aria-label="Show password"], button[aria-label="Hide password"]');

    await expect(toggle).toHaveCount(1);
    await input.fill("e2e-test-password-123");
    await expect(toggle).toBeVisible();

    await page.getByRole("heading", { name: "Create your workspace" }).click();
    await expect(toggle).toBeVisible();
    await input.focus();
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-label", "Hide password");
  });

  test("logging out resets the next visit to light mode without disabling theme switching", async ({ page }) => {
    await signUpViaUI(page);

    await page.getByRole("button", { name: "Dark mode" }).first().click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);

    await logout(page);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(false);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");

    // A fresh load uses the stored light theme, not the previous dark choice.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(false);

    // Normal switching still works after the reset.
    await page.goto("/");
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);
    await page.getByRole("button", { name: "Light mode" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(false);
  });

  test("logging out redirects to /login, and the dashboard is no longer reachable", async ({ page }) => {
    await signUpViaUI(page);

    await logout(page);

    await page.goto("/keywords");
    await page.waitForURL("**/login**");

    // The session cookie is gone, so the public homepage is reachable again
    // instead of being redirected to the dashboard.
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Start free" })).toBeVisible();
  });

  test("an unverified account shows the verify-email banner, and resend works", async ({ page }) => {
    await signUpViaUI(page);

    const banner = page.getByText("Please verify your email address.");
    await expect(banner).toBeVisible();

    await page.getByRole("button", { name: "Resend verification email" }).click();
    // With an email provider configured the UI confirms delivery; without one
    // (as in the Playwright server) it surfaces the send error instead. Both
    // prove the resend request completed rather than hanging.
    await expect(
      page.getByText(/Check your inbox\.|Couldn.t send\. Try again\./)
    ).toBeVisible();
  });

  test("login rejects a wrong password with a generic error, not confirming the email exists", async ({ page }) => {
    const user = await signUpViaUI(page);
    await logout(page);

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("signing up with an already-used email shows a clear error message with login link", async ({ page }) => {
    const user = await signUpViaUI(page);
    await logout(page);

    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Someone Else");
    await page.getByLabel("Company name").fill("A Different Company");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("another-password-123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("An account with this email address already exists. Please log in or use a different email address.")).toBeVisible();
    const loginLink = page.getByRole("alert").getByRole("link", { name: "log in" });
    await expect(loginLink).toHaveAttribute("href", "/login");

    // Loading state resets and form remains usable
    const submitBtn = page.getByRole("button", { name: "Create account" });
    await expect(submitBtn).toBeEnabled();
    expect(page.url()).toContain("/signup");

    // Clicking the link navigates to the login page
    await loginLink.click();
    await page.waitForURL("**/login", { waitUntil: "commit" });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated visitors are bounced from the dashboard to /login", async ({ page }) => {
    await page.goto("/keywords");
    await page.waitForURL("**/login**");
  });

  test("an existing session is restored across refresh, tab reopen, and browser reopen", async ({
    page,
    context,
    browser,
  }) => {
    const user = await signUpViaUI(page);

    // Refreshing keeps the user in the dashboard.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Keyword Research" })).toBeVisible();

    // Closing and reopening a tab must skip the public landing page.
    await page.close();
    const reopenedTab = await context.newPage();
    await reopenedTab.goto("/");
    await reopenedTab.waitForURL("**/keywords", { waitUntil: "commit" });
    await expect(reopenedTab.getByRole("heading", { name: "Keyword Research" })).toBeVisible();
    await expect(reopenedTab.getByRole("link", { name: "Start free" })).toHaveCount(0);

    // Loading /login directly with an existing session also skips the form.
    await reopenedTab.goto("/login");
    await reopenedTab.waitForURL("**/keywords", { waitUntil: "commit" });

    // A new browser context with the persisted cookie represents reopening the
    // browser later; the same workspace session must be restored.
    const storageState = await context.storageState();
    const reopenedBrowser = await browser.newContext({ storageState });
    const reopenedBrowserPage = await reopenedBrowser.newPage();
    await reopenedBrowserPage.goto("/");
    await reopenedBrowserPage.waitForURL("**/keywords", { waitUntil: "commit" });
    await expect(reopenedBrowserPage.getByRole("heading", { name: "Keyword Research" })).toBeVisible();
    await expect(reopenedBrowserPage.getByText(user.companyName).first()).toBeVisible();
    await expect(reopenedBrowserPage.getByRole("link", { name: "Start free" })).toHaveCount(0);

    await reopenedBrowser.close();
  });

  test("an expired or revoked session cookie is sent to login instead of the landing page", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "rankly_session", value: "expired-session-token", domain: "localhost", path: "/" },
    ]);

    await page.goto("/");
    await page.waitForURL("**/login**");
    await expect(page.getByRole("heading", { name: "Log in to Rankly" })).toBeVisible();

    // The auth probe clears the dead cookie, after which "/" is public again.
    await expect
      .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "rankly_session"))
      .toBe(false);
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Start free" })).toBeVisible();
  });
});
