export interface KeywordMetrics {
  term: string;
  locale: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: "informational" | "navigational" | "transactional" | "commercial" | null;
}

export interface KeywordDataProvider {
  readonly name: string;
  readonly isMock: boolean;
  getMetrics(terms: string[], locale: string): Promise<KeywordMetrics[]>;
  getRelatedKeywords(term: string, locale: string, limit?: number): Promise<string[]>;
}

export interface SerpResult {
  term: string;
  engine: string;
  device: "desktop" | "mobile";
  position: number | null;
  url: string | null;
  capturedAt: Date;
}

export interface RankTrackingProvider {
  readonly name: string;
  readonly isMock: boolean;
  getRankings(domain: string, terms: string[], engine: string, device: "desktop" | "mobile"): Promise<SerpResult[]>;
}

export interface AiVisibilityResult {
  term: string;
  engine: string; // "google-ai-overview" | "chatgpt-search" | "perplexity"
  isCited: boolean;
  citedUrl: string | null;
  snippet: string | null;
}

export interface AiVisibilityProvider {
  readonly name: string;
  readonly isMock: boolean;
  checkVisibility(domain: string, terms: string[]): Promise<AiVisibilityResult[]>;
}

export interface CrawledPage {
  url: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  hasCanonical: boolean;
  brokenLinks: string[];
  loadTimeMs: number | null;
}

export interface SiteCrawler {
  readonly name: string;
  crawl(domain: string, maxPages: number): Promise<CrawledPage[]>;
}
