import type { KeywordDataProvider, KeywordMetrics } from "./types";

const API_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live";
const LEGACY_API_URL = "https://api.dataforseo.com/v3/dataforseo_labs/keyword_suggestions/live";
const LOCATION_CODES: Record<string, number> = {
  US: 2840, GB: 2826, IN: 2356, CA: 2124, AU: 2036, DE: 2276, FR: 2250,
  ES: 2724, IT: 2380, BR: 2076, JP: 2392, NL: 2528, SG: 2702, AE: 2784,
};

interface DataForSeoKeyword {
  keyword?: string;
  keyword_info?: { search_volume?: number | null; cpc?: number | null } | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
  search_intent_info?: { main_intent?: string | null } | null;
}

interface DataForSeoResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{
      seed_keyword_data?: DataForSeoKeyword | DataForSeoKeyword[] | null;
      items?: DataForSeoKeyword[] | null;
    }> | null;
  }>;
}

function localeParts(locale: string): { languageCode: string; locationCode: number } {
  const [language, region] = (locale || "en-US").split("-");
  const regionUpper = region?.toUpperCase();
  const locationCode = regionUpper && LOCATION_CODES[regionUpper] ? LOCATION_CODES[regionUpper] : LOCATION_CODES.US;
  return {
    languageCode: language?.toLowerCase() || "en",
    locationCode,
  };
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseIntent(raw: string | null | undefined): KeywordMetrics["intent"] {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "informational" || lower === "navigational" || lower === "commercial" || lower === "transactional") {
    return lower;
  }
  return null;
}

export class DataForSeoKeywordProvider implements KeywordDataProvider {
  readonly name = "dataforseo";
  readonly isMock = false;
  private readonly metrics = new Map<string, KeywordMetrics>();

  constructor(private readonly login: string, private readonly password: string) {
    if (!login.trim() || !password.trim()) {
      throw new Error("DataForSEO login and password are both required.");
    }
  }

  async getRelatedKeywords(term: string, locale: string, limit = 10): Promise<string[]> {
    const keyword = term.trim();
    if (keyword.length < 2 || limit <= 0) return [];

    const { languageCode, locationCode } = localeParts(locale);
    const authHeader = `Basic ${Buffer.from(`${this.login.trim()}:${this.password.trim()}`).toString("base64")}`;
    const requestBody = JSON.stringify([{
      keyword,
      language_code: languageCode,
      location_code: locationCode,
      include_seed_keyword: true,
      exact_match: false,
      limit: Math.min(limit, 100),
    }]);

    const headers = {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Rankly/1.0",
    };

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(20000),
      });

      if (response.status === 404) {
        response = await fetch(LEGACY_API_URL, {
          method: "POST",
          headers,
          body: requestBody,
          signal: AbortSignal.timeout(20000),
        });
      }
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof Error && fetchErr.name === "TimeoutError";
      throw new Error(
        isTimeout
          ? "DataForSEO request timed out after 20 seconds."
          : `DataForSEO connection failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
      );
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as {
          status_message?: string;
          status_code?: number;
          message?: string;
          tasks?: Array<{ status_message?: string; status_code?: number }>;
        };
        const taskMsg = body.tasks?.[0]?.status_message;
        detail = taskMsg || body.status_message || body.message || (body.status_code ? `code ${body.status_code}` : "");
      } catch {
        try {
          const raw = await response.text();
          if (raw) {
            const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
            detail = titleMatch ? titleMatch[1].trim() : raw.slice(0, 150).trim();
          }
        } catch {
          // ignore
        }
      }
      const suffix = detail ? `: ${detail}` : ` (HTTP ${response.status})`;
      throw new Error(`DataForSEO keyword lookup failed${suffix}. Check credentials, permissions, and account balance.`);
    }

    let payload: DataForSeoResponse;
    try {
      payload = (await response.json()) as DataForSeoResponse;
    } catch {
      throw new Error("DataForSEO returned an unreadable keyword response.");
    }

    const task = payload.tasks?.[0];
    if (payload.status_code !== 20000 || task?.status_code !== 20000) {
      const reason = task?.status_message || payload.status_message || "Unknown provider error.";
      throw new Error(`DataForSEO keyword lookup failed: ${reason}`);
    }

    const data = task.result?.[0];
    const seedRecords: DataForSeoKeyword[] = Array.isArray(data?.seed_keyword_data)
      ? data.seed_keyword_data
      : data?.seed_keyword_data
        ? [data.seed_keyword_data]
        : [];
    const itemRecords: DataForSeoKeyword[] = Array.isArray(data?.items) ? data.items : [];
    const records = [...seedRecords, ...itemRecords];
    const seen = new Set<string>();
    const related: string[] = [];

    for (const record of records) {
      const candidate = record.keyword?.trim();
      if (!candidate) continue;
      const key = candidate.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      this.metrics.set(key, {
        term: candidate,
        locale,
        searchVolume: finiteNumber(record.keyword_info?.search_volume),
        difficulty: finiteNumber(record.keyword_properties?.keyword_difficulty),
        cpc: finiteNumber(record.keyword_info?.cpc),
        intent: parseIntent(record.search_intent_info?.main_intent),
      });
      if (key !== keyword.toLocaleLowerCase() && related.length < limit) related.push(candidate);
    }

    return related;
  }

  async getMetrics(terms: string[], locale: string): Promise<KeywordMetrics[]> {
    return terms.map((term) => this.metrics.get(term.trim().toLocaleLowerCase()) ?? {
      term,
      locale,
      searchVolume: null,
      difficulty: null,
      cpc: null,
      intent: null,
    });
  }
}
