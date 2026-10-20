import { getKeywordDataProvider } from "./providers";
import type { KeywordMetrics } from "./providers/types";

export interface KeywordResearchResult {
  seedTerm: string;
  locale: string;
  dataProvider: string;
  isMockData: boolean;
  providerError?: string | null;
  seed: KeywordMetrics;
  related: KeywordMetrics[];
}

import { MockKeywordDataProvider } from "./providers/mock";

export async function researchKeyword(seedTerm: string, locale = "en-US"): Promise<KeywordResearchResult> {
  let provider;
  try {
    provider = await getKeywordDataProvider();
  } catch (err) {
    console.warn("[researchKeyword] getKeywordDataProvider failed; falling back to mock provider:", err);
    provider = new MockKeywordDataProvider();
  }

  try {
    const relatedTerms = await provider.getRelatedKeywords(seedTerm, locale, 10);
    const allMetrics = await provider.getMetrics([seedTerm, ...relatedTerms], locale);

    const [seed, ...related] = allMetrics;

    return {
      seedTerm,
      locale,
      dataProvider: provider.name,
      isMockData: provider.isMock,
      seed: seed ?? {
        term: seedTerm,
        locale,
        searchVolume: null,
        difficulty: null,
        cpc: null,
        intent: null,
      },
      related: related ?? [],
    };
  } catch (err) {
    if (!provider.isMock) {
      const providerError = err instanceof Error ? err.message : String(err);
      console.warn(`[researchKeyword] Live keyword provider "${provider.name}" failed; falling back to mock provider:`, err);
      const mock = new MockKeywordDataProvider();
      const relatedTerms = await mock.getRelatedKeywords(seedTerm);
      const allMetrics = await mock.getMetrics([seedTerm, ...relatedTerms], locale);
      const [seed, ...related] = allMetrics;
      return {
        seedTerm,
        locale,
        dataProvider: `${provider.name} (fallback: mock)`,
        isMockData: true,
        providerError,
        seed: seed ?? {
          term: seedTerm,
          locale,
          searchVolume: null,
          difficulty: null,
          cpc: null,
          intent: null,
        },
        related: related ?? [],
      };
    }
    throw err;
  }
}
