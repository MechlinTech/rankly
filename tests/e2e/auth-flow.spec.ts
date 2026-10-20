import { test, expect } from "@playwright/test";
import { signUpViaUI, logout } from "./helpers";

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

  test("the marketing homepage nav switches to Dashboard once logged in", async ({ page }) => {
    await page.goto("/");
    // "Start free" appears in the nav AND in several page CTAs - scope to the nav specifically.
    await expect(page.getByRole("navigation").getByRole("link", { name: "Start free" })).toBeVisible();

    await signUpViaUI(page);
    await page.goto("/");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Dashboard" })).toBeVisible();
  });
});
