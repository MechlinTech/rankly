import type { KeywordDataProvider, RankTrackingProvider, AiVisibilityProvider } from "./types";
import { MockKeywordDataProvider, MockRankTrackingProvider, MockAiVisibilityProvider } from "./mock";

// Provider factory — swaps mock implementations for real ones once credentials exist.
// No fake integrations: if a real provider's credentials are absent, we explicitly
// fall back to mock data and mark it as such (isMock = true) rather than pretending.

export function getKeywordDataProvider(): KeywordDataProvider {
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    throw new Error(
      "DataForSEO credentials detected but the real adapter is not implemented yet. " +
        "Implement DataForSeoKeywordProvider in providers/dataforseo.ts before enabling this path."
    );
  }
  return new MockKeywordDataProvider();
}

export function getRankTrackingProvider(): RankTrackingProvider {
  if (process.env.SERP_API_KEY) {
    throw new Error(
      "SERP_API_KEY detected but the real adapter is not implemented yet. " +
        "Implement a SerpApiRankProvider in providers/serpapi.ts before enabling this path."
    );
  }
  return new MockRankTrackingProvider();
}

export function getAiVisibilityProvider(): AiVisibilityProvider {
  // No production AI-Overview/answer-engine data provider is wired up yet.
  return new MockAiVisibilityProvider();
}

export * from "./types";
