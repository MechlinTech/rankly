import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKeywordDataProvider } from "./index";

vi.mock("@/lib/admin/integration-credentials", () => ({
  getIntegrationCredential: vi.fn(async (name: string) => process.env[name] || null),
  getOpenSerpCredential: vi.fn(async () => {
    const value = process.env.OPENSERP_API_KEY || process.env.SERP_API_KEY || null;
    return { value, maskedValue: null };
  }),
}));

describe("keyword provider selection", () => {
  const originalOpenSerpKey = process.env.OPENSERP_API_KEY;
  const originalSerpKey = process.env.SERP_API_KEY;
  const originalDataForSeoLogin = process.env.DATAFORSEO_LOGIN;
  const originalDataForSeoPassword = process.env.DATAFORSEO_PASSWORD;

  beforeEach(() => {
    delete process.env.OPENSERP_API_KEY;
    delete process.env.SERP_API_KEY;
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  });

  afterEach(() => {
    if (originalOpenSerpKey === undefined) delete process.env.OPENSERP_API_KEY;
    else process.env.OPENSERP_API_KEY = originalOpenSerpKey;
    if (originalSerpKey === undefined) delete process.env.SERP_API_KEY;
    else process.env.SERP_API_KEY = originalSerpKey;
    if (originalDataForSeoLogin === undefined) delete process.env.DATAFORSEO_LOGIN;
    else process.env.DATAFORSEO_LOGIN = originalDataForSeoLogin;
    if (originalDataForSeoPassword === undefined) delete process.env.DATAFORSEO_PASSWORD;
    else process.env.DATAFORSEO_PASSWORD = originalDataForSeoPassword;
  });

  it("selects OpenSERP for live related-search keyword ideas when configured", async () => {
    process.env.OPENSERP_API_KEY = "test-openserp-key";
    const provider = await getKeywordDataProvider();
    expect(provider.name).toBe("openserp");
    expect(provider.isMock).toBe(false);
  });

  it("selects DataForSEO when both login and password are configured", async () => {
    process.env.DATAFORSEO_LOGIN = "seo_user@example.com";
    process.env.DATAFORSEO_PASSWORD = "secret-pass";
    const provider = await getKeywordDataProvider();
    expect(provider.name).toBe("dataforseo");
    expect(provider.isMock).toBe(false);
  });

  it("rejects partial DataForSEO credentials instead of silently using mock data", async () => {
    process.env.DATAFORSEO_LOGIN = "seo_user@example.com";
    await expect(getKeywordDataProvider()).rejects.toThrow("both the DataForSEO login and password");
  });

  it("uses mock keyword data when no live keyword source is configured", async () => {
    const provider = await getKeywordDataProvider();
    expect(provider.isMock).toBe(true);
  });
});
