import type { KeywordDataProvider, KeywordMetrics } from "./types";

const API_URL = "https://api.dataforseo.com/v3/dataforseo_labs/keyword_suggestions/live";
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

function localeParts(locale: string): { languageCode?: string; locationCode?: number } {
  const [language, region] = locale.split("-");
  return {
    languageCode: language?.toLowerCase() || undefined,
    locationCode: region ? LOCATION_CODES[region.toUpperCase()] : undefined,
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
    if (keyword.length < 3 || limit <= 0) return [];

    const { languageCode, locationCode } = localeParts(locale);
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.login.trim()}:${this.password.trim()}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify([{
        keyword,
        ...(languageCode ? { language_code: languageCode } : {}),
        ...(locationCode ? { location_code: locationCode } : {}),
        include_seed_keyword: true,
        exact_match: false,
        limit: Math.min(limit, 100),
      }]),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`DataForSEO keyword lookup failed (HTTP ${response.status}). Check the DataForSEO credentials and account balance.`);
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
