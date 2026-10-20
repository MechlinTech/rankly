import { afterEach, describe, expect, it, vi } from "vitest";
import { emailFromAddress, isEmailConfigured } from "./resend";

vi.mock("@/lib/admin/integration-credentials", () => ({
  getIntegrationCredential: vi.fn(async (name: string) => process.env[name] || null),
}));

const ORIGINAL = {
  EMAIL_FROM: process.env.EMAIL_FROM,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

afterEach(() => {
  process.env.EMAIL_FROM = ORIGINAL.EMAIL_FROM;
  process.env.RESEND_FROM_EMAIL = ORIGINAL.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = ORIGINAL.RESEND_API_KEY;
});

describe("email from address", () => {
  it("uses RESEND_FROM_EMAIL when EMAIL_FROM is unset", async () => {
    delete process.env.EMAIL_FROM;
    process.env.RESEND_FROM_EMAIL = "Rankly <noreply@example.com>";
    process.env.RESEND_API_KEY = "re_test";
    await expect(emailFromAddress()).resolves.toBe("Rankly <noreply@example.com>");
    await expect(isEmailConfigured()).resolves.toBe(true);
  });

  it("prefers EMAIL_FROM when both are set", async () => {
    process.env.EMAIL_FROM = "Rankly <hello@example.com>";
    process.env.RESEND_FROM_EMAIL = "Other <other@example.com>";
    await expect(emailFromAddress()).resolves.toBe("Rankly <hello@example.com>");
  });

  it("is not configured when the from address is missing", async () => {
    delete process.env.EMAIL_FROM;
    delete process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    await expect(isEmailConfigured()).resolves.toBe(false);
  });
});
