import { getKeywordDataProvider } from "./providers";
import type { KeywordMetrics } from "./providers/types";

export interface KeywordResearchResult {
  seedTerm: string;
  locale: string;
  isMockData: boolean;
  seed: KeywordMetrics;
  related: KeywordMetrics[];
}

export async function researchKeyword(seedTerm: string, locale = "en-US"): Promise<KeywordResearchResult> {
  const provider = getKeywordDataProvider();
  const relatedTerms = await provider.getRelatedKeywords(seedTerm, locale, 10);
  const allMetrics = await provider.getMetrics([seedTerm, ...relatedTerms], locale);

  const [seed, ...related] = allMetrics;

  return {
    seedTerm,
    locale,
    isMockData: provider.isMock,
    seed,
    related,
  };
}
