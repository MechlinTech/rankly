import { test, expect } from "@playwright/test";
import { signUpViaUI, logout } from "./helpers";

test.describe("auth flow (real browser)", () => {
  test("signup lands on the dashboard with the correct tenant shown", async ({ page }) => {
    const user = await signUpViaUI(page);

    await expect(page.getByRole("heading", { name: "Keyword Research" })).toBeVisible();
    await expect(page.getByText(user.companyName)).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
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
    await expect(page.getByText("Check your inbox.")).toBeVisible();
  });

  test("login rejects a wrong password with a generic error, not confirming the email exists", async ({ page }) => {
    const user = await signUpViaUI(page);
    await logout(page);

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("signing up with an already-used email fails without revealing why", async ({ page }) => {
    const user = await signUpViaUI(page);
    await logout(page);

    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Someone Else");
    await page.getByLabel("Company name").fill("A Different Company");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("another-password-123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Could not create account with these details.")).toBeVisible();
    expect(page.url()).toContain("/signup");
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
