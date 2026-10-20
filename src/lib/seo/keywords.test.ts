import { describe, it, expect, vi, afterEach } from "vitest";
import { researchKeyword } from "./keywords";
import * as providersModule from "./providers";
import type { KeywordDataProvider } from "./providers/types";

describe("researchKeyword", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns keywords from the primary provider when healthy", async () => {
    const mockProvider: KeywordDataProvider = {
      name: "test-provider",
      isMock: false,
      getRelatedKeywords: vi.fn(async () => ["seo audit", "seo tools"]),
      getMetrics: vi.fn(async (terms: string[], locale: string) =>
        terms.map((term) => ({
          term,
          locale,
          searchVolume: 1000,
          difficulty: 40,
          cpc: 2.5,
          intent: "commercial" as const,
        }))
      ),
    };

    vi.spyOn(providersModule, "getKeywordDataProvider").mockResolvedValue(mockProvider);

    const result = await researchKeyword("seo", "en-US");
    expect(result.seedTerm).toBe("seo");
    expect(result.dataProvider).toBe("test-provider");
    expect(result.isMockData).toBe(false);
    expect(result.seed.term).toBe("seo");
    expect(result.related).toHaveLength(2);
  });

  it("gracefully falls back to mock data when live provider throws a timeout or network error", async () => {
    const failingProvider: KeywordDataProvider = {
      name: "openserp",
      isMock: false,
      getRelatedKeywords: vi.fn(async () => {
        throw new Error("OpenSERP keyword lookup failed (HTTP 502).");
      }),
      getMetrics: vi.fn(async () => []),
    };

    vi.spyOn(providersModule, "getKeywordDataProvider").mockResolvedValue(failingProvider);

    const result = await researchKeyword("seo", "en-US");
    expect(result.seedTerm).toBe("seo");
    expect(result.isMockData).toBe(true);
    expect(result.dataProvider).toContain("fallback: mock");
    expect(result.seed.term).toBe("seo");
    expect(result.related.length).toBeGreaterThan(0);
  });

  it("gracefully falls back to mock provider if getKeywordDataProvider fails", async () => {
    vi.spyOn(providersModule, "getKeywordDataProvider").mockRejectedValue(
      new Error("APP_ENCRYPTION_KEY missing or corrupted")
    );

    const result = await researchKeyword("rankly", "en-US");
    expect(result.seedTerm).toBe("rankly");
    expect(result.isMockData).toBe(true);
    expect(result.seed.term).toBe("rankly");
    expect(result.related.length).toBeGreaterThan(0);
  });
});
