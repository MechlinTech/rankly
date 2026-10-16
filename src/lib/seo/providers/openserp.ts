import type { RankTrackingProvider, SerpResult } from "./types";

interface OpenSerpPosition {
  absolute?: number;
  rank?: number;
  page?: number;
  type?: string;
}

interface OpenSerpResultItem {
  id?: string;
  domain?: string;
  display_url?: string;
  url?: string;
  title?: string;
  snippet?: string;
  position?: OpenSerpPosition;
}

interface OpenSerpSearchResponse {
  billing?: {
    credits_remaining?: number;
    credits_used?: number;
  };
  meta?: {
    took_ms?: number;
    request_id?: string;
  };
  results?: OpenSerpResultItem[];
  error?: string;
  message?: string;
}

/**
 * Normalizes a domain or host string for robust comparison:
 * Strips protocol, www prefix, path, and port, converting to lowercase.
 */
export function normalizeDomain(input: string): string {
  if (!input) return "";
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, "");
  cleaned = cleaned.replace(/^www\./i, "");
  cleaned = cleaned.replace(/\/.*$/, "");
  cleaned = cleaned.replace(/:\d+$/, "");
  return cleaned;
}

/**
 * Checks if a search result's domain or URL belongs to the target domain.
 * Supports exact matches and subdomains (e.g., docs.example.com matches example.com),
 * while preventing false substring matches (e.g., notexample.com will not match example.com).
 */
export function isDomainMatch(
  itemDomain: string | undefined,
  itemUrl: string | undefined,
  targetDomain: string
): boolean {
  const target = normalizeDomain(targetDomain);
  if (!target) return false;

  const candidateDomains: string[] = [];

  if (itemDomain) {
    candidateDomains.push(normalizeDomain(itemDomain));
  }

  if (itemUrl) {
    try {
      const urlObj = new URL(itemUrl.startsWith("http") ? itemUrl : `https://${itemUrl}`);
      candidateDomains.push(normalizeDomain(urlObj.hostname));
    } catch {
      const hostMatch = itemUrl.match(/^(?:https?:\/\/)?([a-zA-Z0-9.-]+)/i);
      if (hostMatch && hostMatch[1]) {
        candidateDomains.push(normalizeDomain(hostMatch[1]));
      }
    }
  }

  for (const candidate of candidateDomains) {
    if (!candidate) continue;
    if (candidate === target) return true;
    if (candidate.endsWith(`.${target}`)) return true;
  }

  return false;
}

/**
 * Extracts 1-based numerical rank from OpenSERP's position object
 * Supports both position.absolute (e.g. 2) and position.rank.
 */
export function extractRank(pos: OpenSerpPosition | undefined): number | null {
  if (!pos) return null;
  if (typeof pos.absolute === "number" && pos.absolute > 0) return pos.absolute;
  if (typeof pos.rank === "number" && pos.rank > 0) return pos.rank;
  return null;
}

/**
 * Lightweight concurrency executor that limits parallel in-flight promises.
 */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

export class OpenSerpRankProvider implements RankTrackingProvider {
  readonly name = "openserp";
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openserp.org"
  ) {
    if (!apiKey?.trim()) {
      throw new Error("OpenSerpRankProvider requires a non-empty API key.");
    }
  }

  /**
   * Fetches single search term rankings with automatic retry on temporary failures.
   */
  private async queryTermWithRetry(
    term: string,
    engine: string,
    device: "desktop" | "mobile",
    targetDomain: string,
    retries = 1
  ): Promise<SerpResult> {
    const capturedAt = new Date();
    const endpoint = `${this.baseUrl}/v1/${encodeURIComponent(engine)}/search?text=${encodeURIComponent(
      term
    )}&device=${encodeURIComponent(device)}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey.trim()}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (response.status === 429 && retries > 0) {
        // Rate limited: wait 800ms and retry once
        await new Promise((r) => setTimeout(r, 800));
        return this.queryTermWithRetry(term, engine, device, targetDomain, retries - 1);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          throw new Error("OpenSERP API key is invalid or unauthorized.");
        }
        if (response.status === 402) {
          throw new Error("OpenSERP credits exhausted. Please recharge your balance.");
        }

        console.error(
          `[OpenSerpRankProvider] Failed for "${term}": HTTP ${response.status} - ${errorBody.slice(0, 200)}`
        );
        return {
          term,
          engine,
          device,
          position: null,
          url: null,
          title: null,
          snippet: null,
          resultType: null,
          page: null,
          topCompetitor: null,
          capturedAt,
        };
      }

      const data = (await response.json()) as OpenSerpSearchResponse;
      const results = Array.isArray(data.results) ? data.results : [];

      // Extract top #1 search result across the whole SERP for competitive insight
      let topCompetitor: SerpResult["topCompetitor"] = null;
      if (results.length > 0) {
        const topItem = results[0];
        const topDomain = topItem.domain || normalizeDomain(topItem.url || topItem.display_url || "");
        topCompetitor = {
          domain: topDomain || null,
          url: topItem.url || topItem.display_url || null,
          title: topItem.title || null,
        };
      }

      const matches = results.filter((item) =>
        isDomainMatch(item.domain, item.url || item.display_url, targetDomain)
      );

      if (matches.length === 0) {
        return {
          term,
          engine,
          device,
          position: null,
          url: null,
          title: null,
          snippet: null,
          resultType: null,
          page: null,
          topCompetitor,
          capturedAt,
        };
      }

      // Sort by rank ascending to take the best organic rank
      matches.sort((a, b) => {
        const rankA = extractRank(a.position) ?? 9999;
        const rankB = extractRank(b.position) ?? 9999;
        return rankA - rankB;
      });

      const best = matches[0];
      const position = extractRank(best.position);
      const rawUrl = best.url || best.display_url || `https://${targetDomain}`;
      const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
      const title = best.title || null;
      const snippet = best.snippet || null;
      const resultType = best.position?.type || "organic";
      const page = best.position?.page || (position ? Math.ceil(position / 10) : 1);

      return {
        term,
        engine,
        device,
        position,
        url,
        title,
        snippet,
        resultType,
        page,
        topCompetitor,
        capturedAt,
      };
    } catch (err) {
      if (err instanceof Error && (err.message.includes("invalid") || err.message.includes("exhausted"))) {
        throw err;
      }
      console.error(`[OpenSerpRankProvider] Error querying "${term}":`, err);
      return {
        term,
        engine,
        device,
        position: null,
        url: null,
        title: null,
        snippet: null,
        resultType: null,
        page: null,
        topCompetitor: null,
        capturedAt,
      };
    }
  }

  /**
   * Fetches rankings for multiple terms with concurrency control (max 4 parallel requests).
   */
  async getRankings(
    domain: string,
    terms: string[],
    engine = "google",
    device: "desktop" | "mobile" = "desktop"
  ): Promise<SerpResult[]> {
    const normalizedTarget = normalizeDomain(domain);
    const cleanedTerms = terms.map((t) => t.trim()).filter(Boolean);

    if (cleanedTerms.length === 0) {
      return [];
    }

    // Execute queries with max concurrency of 4 to stay well within API limits
    return mapConcurrent(cleanedTerms, 4, async (term) => {
      return this.queryTermWithRetry(term, engine, device, normalizedTarget);
    });
  }
}
