import type { Page } from "@playwright/test";

export function randomEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e-test.local`;
}

export interface SignedUpUser {
  email: string;
  password: string;
  companyName: string;
}

/** Clicks the dashboard's "Log out" button and waits for the redirect to /login. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Log out" }).first().click();
  // waitUntil: "commit" - this app navigates via router.push (client-side
  // transition), which doesn't fire a full browser "load" event. Playwright's
  // default waitUntil for waitForURL is "load", which hangs waiting for an
  // event that Next.js's SPA routing never dispatches.
  await page.waitForURL("**/login", { waitUntil: "commit" });
}

/** Signs up a brand-new user through the real UI (not an API shortcut) and lands on /keywords. */
export async function signUpViaUI(page: Page, overrides: Partial<SignedUpUser> = {}): Promise<SignedUpUser> {
  const user: SignedUpUser = {
    email: overrides.email ?? randomEmail("e2e"),
    password: overrides.password ?? "e2e-test-password-123",
    companyName: overrides.companyName ?? `E2E Test Co ${Date.now()}`,
  };

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("E2E Test User");
  await page.getByLabel("Company name").fill(user.companyName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/keywords", { waitUntil: "commit" });

  return user;
}
