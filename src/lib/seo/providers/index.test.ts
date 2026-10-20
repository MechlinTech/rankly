import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getKeywordDataProvider } from "./index";

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

  it("selects OpenSERP for live related-search keyword ideas when configured", () => {
    process.env.OPENSERP_API_KEY = "test-openserp-key";
    const provider = getKeywordDataProvider();
    expect(provider.name).toBe("openserp");
    expect(provider.isMock).toBe(false);
  });

  it("uses mock keyword data when no live keyword source is configured", () => {
    const provider = getKeywordDataProvider();
    expect(provider.isMock).toBe(true);
  });
});
