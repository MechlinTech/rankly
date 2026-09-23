import { defineConfig } from "vitest/config";

// Separate from vitest.config.mts (the fast, DB-free unit suite). These tests
// spin up a real `next dev` server and hit it over HTTP, against whatever real
// Postgres DATABASE_URL points at — see tests/integration/global-setup.ts and
// TEST_PLAN.md. Run with `npm run test:integration`, never as part of `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
