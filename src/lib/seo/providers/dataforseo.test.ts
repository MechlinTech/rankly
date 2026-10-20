import { afterEach, describe, expect, it, vi } from "vitest";
import { DataForSeoKeywordProvider } from "./dataforseo";

describe("DataForSEO keyword provider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("authenticates and maps live keyword suggestions and metrics", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status_code: 20000,
        status_message: "Ok.",
        tasks: [{
          status_code: 20000,
          status_message: "Ok.",
          result: [{
            seed_keyword_data: [{
              keyword: "app development",
              keyword_info: { search_volume: 1200, cpc: 2.5 },
              keyword_properties: { keyword_difficulty: 42 },
            }],
            items: [{
              keyword: "app development services",
              keyword_info: { search_volume: 800, cpc: 3.25 },
              keyword_properties: { keyword_difficulty: 51 },
            }],
          }],
        }],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new DataForSeoKeywordProvider(" seo@example.com ", " secret ");
    const terms = await provider.getRelatedKeywords("app development", "en-US", 10);
    const metrics = await provider.getMetrics(["app development", "app development services"], "en-US");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("dataforseo_labs/google/keyword_suggestions/live");
    expect(new Headers(request.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("seo@example.com:secret").toString("base64")}`,
    );
    expect(JSON.parse(String(request.body))).toEqual([expect.objectContaining({
      keyword: "app development",
      language_code: "en",
      location_code: 2840,
      include_seed_keyword: true,
    })]);
    expect(terms).toEqual(["app development services"]);
    expect(metrics).toEqual([
      { term: "app development", locale: "en-US", searchVolume: 1200, difficulty: 42, cpc: 2.5, intent: null },
      { term: "app development services", locale: "en-US", searchVolume: 800, difficulty: 51, cpc: 3.25, intent: null },
    ]);
  });

  it("handles seed_keyword_data as an object and extracts search intent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status_code: 20000,
        status_message: "Ok.",
        tasks: [{
          status_code: 20000,
          status_message: "Ok.",
          result: [{
            seed_keyword_data: {
              keyword: "crm software",
              keyword_info: { search_volume: 5000, cpc: 12.0 },
              keyword_properties: { keyword_difficulty: 75 },
              search_intent_info: { main_intent: "commercial" },
            },
            items: [{
              keyword: "best crm software",
              keyword_info: { search_volume: 2400, cpc: 9.5 },
              keyword_properties: { keyword_difficulty: 68 },
              search_intent_info: { main_intent: "transactional" },
            }],
          }],
        }],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new DataForSeoKeywordProvider("user", "pass");
    const terms = await provider.getRelatedKeywords("crm software", "en-US", 10);
    const metrics = await provider.getMetrics(["crm software", "best crm software"], "en-US");

    expect(terms).toEqual(["best crm software"]);
    expect(metrics).toEqual([
      { term: "crm software", locale: "en-US", searchVolume: 5000, difficulty: 75, cpc: 12.0, intent: "commercial" },
      { term: "best crm software", locale: "en-US", searchVolume: 2400, difficulty: 68, cpc: 9.5, intent: "transactional" },
    ]);
  });

  it("falls back to legacy URL when Google endpoint returns 404", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/google/")) {
        return { status: 404, ok: false };
      }
      return {
        ok: true,
        json: async () => ({
          status_code: 20000,
          tasks: [{
            status_code: 20000,
            result: [{
              items: [{ keyword: "crm tools", keyword_info: { search_volume: 300 } }],
            }],
          }],
        }),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new DataForSeoKeywordProvider("user", "pass");
    const terms = await provider.getRelatedKeywords("crm", "en-US", 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(terms).toEqual(["crm tools"]);
  });

  it("surfaces friendly timeout message when request aborts due to timeout", async () => {
    const timeoutErr = new Error("The operation was aborted due to timeout");
    timeoutErr.name = "TimeoutError";
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutErr);

    const provider = new DataForSeoKeywordProvider("user", "pass");
    await expect(provider.getRelatedKeywords("crm", "en-US", 5)).rejects.toThrow(
      "DataForSEO request timed out after 20 seconds."
    );
  });
});
