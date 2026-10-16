import type {
  KeywordDataProvider,
  KeywordMetrics,
  RankTrackingProvider,
  SerpResult,
  AiVisibilityProvider,
  AiVisibilityResult,
} from "./types";

// Deterministic pseudo-random so mock data is stable across calls for the same term.
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

export class MockKeywordDataProvider implements KeywordDataProvider {
  readonly name = "mock-keyword-provider";
  readonly isMock = true;

  async getMetrics(terms: string[], locale: string): Promise<KeywordMetrics[]> {
    return terms.map((term) => {
      const r = seededRandom(term + locale);
      return {
        term,
        locale,
        searchVolume: Math.round(r * 50000),
        difficulty: Math.round(r * 100),
        cpc: Number((r * 12).toFixed(2)),
        intent: (["informational", "navigational", "transactional", "commercial"] as const)[
          Math.floor(r * 4)
        ],
      };
    });
  }

  async getRelatedKeywords(term: string): Promise<string[]> {
    const suffixes = ["guide", "tips", "vs", "pricing", "tools", "examples", "best practices"];
    return suffixes.map((s) => `${term} ${s}`);
  }
}

export class MockRankTrackingProvider implements RankTrackingProvider {
  readonly name = "mock-rank-provider";
  readonly isMock = true;

  async getRankings(
    domain: string,
    terms: string[],
    engine: string,
    device: "desktop" | "mobile"
  ): Promise<SerpResult[]> {
    return terms.map((term) => {
      const r = seededRandom(domain + term + engine + device);
      const position = r < 0.15 ? null : Math.ceil(r * 100);
      const competitors = ["wikipedia.org", "forbes.com", "nytimes.com", "hubspot.com", "techcrunch.com"];
      const compDomain = competitors[Math.floor(r * competitors.length)];

      return {
        term,
        engine,
        device,
        position,
        url: position ? `https://${domain}/${term.toLowerCase().replace(/\s+/g, "-")}` : null,
        title: position ? `${term.charAt(0).toUpperCase() + term.slice(1)} | Comprehensive Guide - ${domain}` : null,
        snippet: position ? `Explore the best insights on ${term}. Find key strategies, in-depth analysis, and expert reviews from ${domain}.` : null,
        resultType: position === 1 ? "featured_snippet" : "organic",
        page: position ? Math.ceil(position / 10) : null,
        topCompetitor: {
          domain: compDomain,
          url: `https://${compDomain}/${term.toLowerCase().replace(/\s+/g, "-")}`,
          title: `${term.charAt(0).toUpperCase() + term.slice(1)} - Complete Overview & Analysis`,
        },
        capturedAt: new Date(),
      };
    });
  }
}

export class MockAiVisibilityProvider implements AiVisibilityProvider {
  readonly name = "mock-ai-visibility-provider";
  readonly isMock = true;

  async checkVisibility(domain: string, terms: string[]): Promise<AiVisibilityResult[]> {
    const engines = ["google-ai-overview", "chatgpt-search", "perplexity"];
    const results: AiVisibilityResult[] = [];
    for (const term of terms) {
      for (const engine of engines) {
        const r = seededRandom(domain + term + engine);
        const isCited = r > 0.6;
        results.push({
          term,
          engine,
          isCited,
          citedUrl: isCited ? `https://${domain}/` : null,
          snippet: isCited ? `Mock snippet citing ${domain} for "${term}".` : null,
        });
      }
    }
    return results;
  }
}
