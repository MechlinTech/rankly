import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export const BASE_URL = `http://localhost:${PORT}`;

// Real browser E2E tests against a real `next dev` server + real Postgres.
// Separate from vitest.integration.config.mts (HTTP-only, no browser) and
// vitest.config.mts (pure unit tests, no DB). See TEST_PLAN.md.
export default defineConfig({
  testDir: "./tests/e2e",
  // Generous timeout: this runs against `next dev`, where the very first hit
  // on any given route pays a real Turbopack compile cost (a few seconds),
  // on top of normal network time - not something to shave down artificially.
  timeout: 45_000,
  fullyParallel: false, // shares one dev server + DB; avoid cross-test interference
  // Force a single worker: `fullyParallel: false` only serializes tests within
  // one file - by default Playwright still runs separate spec files in
  // parallel workers, which caused real concurrent-load DB protocol errors
  // ("bind message supplies N parameters, but prepared statement requires 0")
  // against this session's ephemeral prisma dev Postgres (connection_limit=10)
  // under 3 concurrent workers hitting the one shared dev server. All these
  // specs share one webServer + one database, so they need to run serially.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
