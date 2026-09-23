import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A dummy DATABASE_URL so importing modules that construct a Prisma client at
    // module scope (src/lib/db.ts) doesn't throw during unit tests that never
    // actually touch the database - the adapter only stores this, it doesn't connect.
    env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test" },
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
