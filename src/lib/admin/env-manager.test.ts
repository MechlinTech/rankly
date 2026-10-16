import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { updateEnvFile } from "./env-manager";

describe("env-manager", () => {
  let tmpDir: string;
  let tmpEnvPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rankly-env-test-"));
    tmpEnvPath = path.join(tmpDir, ".env");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates and writes keys to a new env file", async () => {
    await updateEnvFile(tmpEnvPath, {
      OPENSERP_API_KEY: "osk_test_123",
      RESEND_API_KEY: "re_test_456",
    });

    const content = await fs.readFile(tmpEnvPath, "utf-8");
    expect(content).toContain('OPENSERP_API_KEY="osk_test_123"');
    expect(content).toContain('RESEND_API_KEY="re_test_456"');
  });

  it("updates existing keys without deleting comments or other variables", async () => {
    const initialContent = `# Rankly configuration
PORT=3000
# Third party credentials
OPENSERP_API_KEY="old_key"
EXISTING_VAR="preserved"
`;
    await fs.writeFile(tmpEnvPath, initialContent, "utf-8");

    await updateEnvFile(tmpEnvPath, {
      OPENSERP_API_KEY: "new_updated_key",
      NEW_API_KEY: "brand_new_key",
    });

    const content = await fs.readFile(tmpEnvPath, "utf-8");
    expect(content).toContain("# Rankly configuration");
    expect(content).toContain("PORT=3000");
    expect(content).toContain('EXISTING_VAR="preserved"');
    expect(content).toContain('OPENSERP_API_KEY="new_updated_key"');
    expect(content).toContain('NEW_API_KEY="brand_new_key"');
    expect(content).not.toContain("old_key");
  });
});
