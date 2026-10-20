import { describe, it, expect, vi, afterEach } from "vitest";
import {
  maskApiKey,
  testOpenSerp,
  testResend,
  testAnthropic,
  testStripe,
  testDataForSeo,
  testGoogleOAuth,
  testMicrosoftOAuth,
} from "./settings-tester";

function createMockResponse(data: unknown, options: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? (options.ok === false ? 400 : 200),
    statusText: options.statusText ?? (options.ok === false ? "Error" : "OK"),
    json: async () => data,
  } as unknown as Response;
}

describe("Settings Tester", () => {
  describe("maskApiKey", () => {
    it("returns null for empty or null keys", () => {
      expect(maskApiKey(null)).toBeNull();
      expect(maskApiKey(undefined)).toBeNull();
      expect(maskApiKey("   ")).toBeNull();
    });

    it("masks short keys completely", () => {
      expect(maskApiKey("short")).toBe("••••••••");
      expect(maskApiKey("12345678")).toBe("••••••••");
    });

    it("masks OpenSERP keys with osk_live_ prefix and 4-char suffix", () => {
      const masked = maskApiKey("osk_live_uGGBzi1NlowZcGqRVc0PcS_VfQasS5afzOrBIqUTOF4");
      expect(masked).toBe("osk_live_••••••••TOF4");
    });

    it("masks Resend keys with re_ prefix and 4-char suffix", () => {
      const masked = maskApiKey("re_8Q8wD8s7_2NuV4K8L6mG54321");
      expect(masked).toBe("re_8Q••••••••4321");
    });

    it("masks generic keys with 4-char prefix and 4-char suffix", () => {
      const masked = maskApiKey("sk-ant-api03-abcdefghijklmnop");
      expect(masked).toBe("sk-a••••••••mnop");
    });
  });

  describe("API Connection Checkers (Mocked Fetch)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("tests OpenSERP key success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ email: "admin@rankly.org", id: "usr_123" })
      );

      const result = await testOpenSerp("osk_live_testkey123456789");
      expect(result.success).toBe(true);
      expect(result.message).toContain("admin@rankly.org");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("tests OpenSERP failure response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ message: "Invalid API key provided" }, { ok: false, status: 401, statusText: "Unauthorized" })
      );

      const result = await testOpenSerp("osk_live_invalid");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid API key provided");
    });

    it("tests Resend key success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ data: [{ id: "key_1" }, { id: "key_2" }] })
      );

      const result = await testResend("re_123456789");
      expect(result.success).toBe(true);
      expect(result.message).toContain("2 active keys found");
    });

    it("tests Anthropic key success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ data: [{ id: "claude-3-7-sonnet" }, { id: "claude-3-5-haiku" }] })
      );

      const result = await testAnthropic("sk-ant-123456789");
      expect(result.success).toBe(true);
      expect(result.message).toContain("2 models available");
    });

    it("tests Stripe secret key success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ livemode: false, object: "balance" })
      );

      const result = await testStripe("sk_test_123456789");
      expect(result.success).toBe(true);
      expect(result.message).toContain("Test Sandbox");
    });

    it("tests DataForSEO credentials success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({
          status_code: 20000,
          status_message: "Ok.",
          tasks: [
            {
              status_code: 20000,
              status_message: "Ok.",
              result: [
                {
                  login: "seo_user@example.com",
                  money: { balance: 48.5 },
                },
              ],
            },
          ],
        })
      );

      const result = await testDataForSeo("seo_user@example.com", "secretpass");
      expect(result.success).toBe(true);
      expect(result.message).toContain("$48.50");
    });

    it("reports DataForSEO API-level credential errors even when HTTP is 200", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(createMockResponse({
        status_code: 40100,
        status_message: "Authorization failed.",
        tasks: [],
      }));

      const result = await testDataForSeo("seo_user@example.com", "wrong-password");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Authorization failed");
    });

    it("validates Google OAuth client ID format before request", async () => {
      const result = await testGoogleOAuth("invalid-client-id");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid Client ID");
    });

    it("validates Google OAuth client ID success with valid domain", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ issuer: "https://accounts.google.com" })
      );

      const result = await testGoogleOAuth("123456-abcdef.apps.googleusercontent.com");
      expect(result.success).toBe(true);
      expect(result.message).toContain("Google OpenID endpoint reachable");
    });

    it("validates Microsoft OAuth client ID UUID format", async () => {
      const invalid = await testMicrosoftOAuth("not-a-uuid");
      expect(invalid.success).toBe(false);
      expect(invalid.message).toContain("UUID format");

      globalThis.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ issuer: "https://login.microsoftonline.com" })
      );

      const valid = await testMicrosoftOAuth("11111111-2222-3333-4444-555555555555");
      expect(valid.success).toBe(true);
      expect(valid.message).toContain("Microsoft Entra ID endpoint reachable");
    });
  });
});
