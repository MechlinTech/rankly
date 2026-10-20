import type { KeywordDataProvider, RankTrackingProvider, AiVisibilityProvider } from "./types";
import { MockKeywordDataProvider, MockRankTrackingProvider, MockAiVisibilityProvider } from "./mock";
import { OpenSerpRankProvider } from "./openserp";
import { DataForSeoKeywordProvider } from "./dataforseo";
import { getIntegrationCredential, getOpenSerpCredential } from "@/lib/admin/integration-credentials";

// Provider factory — swaps mock implementations for real ones once credentials exist.
// No fake integrations: if a real provider's credentials are absent, we explicitly
// fall back to mock data and mark it as such (isMock = true) rather than pretending.

export async function getKeywordDataProvider(): Promise<KeywordDataProvider> {
  const [{ value: openSerpApiKey }, dataForSeoLogin, dataForSeoPassword] = await Promise.all([
    getOpenSerpCredential().catch((err) => {
      console.warn("[getKeywordDataProvider] Could not read OpenSERP credential:", err);
      return { value: process.env.OPENSERP_API_KEY || process.env.SERP_API_KEY || null, maskedValue: null };
    }),
    getIntegrationCredential("DATAFORSEO_LOGIN").catch((err) => {
      console.warn("[getKeywordDataProvider] Could not read DataForSEO login:", err);
      return process.env.DATAFORSEO_LOGIN || null;
    }),
    getIntegrationCredential("DATAFORSEO_PASSWORD").catch((err) => {
      console.warn("[getKeywordDataProvider] Could not read DataForSEO password:", err);
      return process.env.DATAFORSEO_PASSWORD || null;
    }),
  ]);
  if (dataForSeoLogin?.trim() && dataForSeoPassword?.trim()) {
    return new DataForSeoKeywordProvider(dataForSeoLogin, dataForSeoPassword);
  }
  if (dataForSeoLogin?.trim() || dataForSeoPassword?.trim()) {
    throw new Error("Configure both the DataForSEO login and password to enable keyword metrics.");
  }
  if (openSerpApiKey?.trim()) {
    return new OpenSerpRankProvider(openSerpApiKey.trim());
  }
  return new MockKeywordDataProvider();
}

export async function getRankTrackingProvider(): Promise<RankTrackingProvider> {
  const { value: apiKey } = await getOpenSerpCredential().catch((err) => {
    console.warn("[getRankTrackingProvider] Could not read OpenSERP credential:", err);
    return { value: process.env.OPENSERP_API_KEY || process.env.SERP_API_KEY || null, maskedValue: null };
  });
  if (apiKey?.trim()) {
    return new OpenSerpRankProvider(apiKey.trim());
  }

  return new MockRankTrackingProvider();
}

export function getAiVisibilityProvider(): AiVisibilityProvider {
  // No production AI-Overview/answer-engine data provider is wired up yet.
  return new MockAiVisibilityProvider();
}

export * from "./types";
export * from "./openserp";
