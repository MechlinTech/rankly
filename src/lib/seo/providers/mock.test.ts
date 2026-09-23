import { describe, it, expect } from "vitest";
import { MockKeywordDataProvider, MockRankTrackingProvider, MockAiVisibilityProvider } from "./mock";

describe("MockKeywordDataProvider", () => {
  const provider = new MockKeywordDataProvider();

  it("is marked as mock data", () => {
    expect(provider.isMock).toBe(true);
  });

  it("returns deterministic metrics for the same term and locale", async () => {
    const first = await provider.getMetrics(["seo tools"], "en-US");
    const second = await provider.getMetrics(["seo tools"], "en-US");
    expect(first).toEqual(second);
  });

  it("returns different metrics for a different locale", async () => {
    const us = await provider.getMetrics(["seo tools"], "en-US");
    const gb = await provider.getMetrics(["seo tools"], "en-GB");
    expect(us[0].searchVolume).not.toBe(gb[0].searchVolume);
  });

  it("returns metrics within expected ranges", async () => {
    const [metrics] = await provider.getMetrics(["anything"], "en-US");
    expect(metrics.searchVolume).toBeGreaterThanOrEqual(0);
    expect(metrics.searchVolume).toBeLessThanOrEqual(50000);
    expect(metrics.difficulty).toBeGreaterThanOrEqual(0);
    expect(metrics.difficulty).toBeLessThanOrEqual(100);
    expect(["informational", "navigational", "transactional", "commercial"]).toContain(metrics.intent);
  });

  it("returns related keywords derived from the seed term", async () => {
    const related = await provider.getRelatedKeywords("widgets");
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((r) => r.startsWith("widgets "))).toBe(true);
  });
});

describe("MockRankTrackingProvider", () => {
  const provider = new MockRankTrackingProvider();

  it("is marked as mock data", () => {
    expect(provider.isMock).toBe(true);
  });

  it("is deterministic for the same domain/term/engine/device", async () => {
    const first = await provider.getRankings("example.com", ["seo"], "google", "desktop");
    const second = await provider.getRankings("example.com", ["seo"], "google", "desktop");
    expect(first[0].position).toBe(second[0].position);
  });

  it("returns a null url when position is null", async () => {
    const results = await provider.getRankings("example.com", Array.from({ length: 20 }, (_, i) => `term-${i}`), "google", "desktop");
    for (const r of results) {
      if (r.position === null) {
        expect(r.url).toBeNull();
      } else {
        expect(r.url).toContain("example.com");
      }
    }
  });

  it("echoes back the requested engine and device", async () => {
    const [result] = await provider.getRankings("example.com", ["seo"], "bing", "mobile");
    expect(result.engine).toBe("bing");
    expect(result.device).toBe("mobile");
  });
});

describe("MockAiVisibilityProvider", () => {
  const provider = new MockAiVisibilityProvider();

  it("returns a result for every (term, engine) combination", async () => {
    const results = await provider.checkVisibility("example.com", ["a", "b"]);
    expect(results).toHaveLength(2 * 3); // 3 engines hardcoded in the mock
  });

  it("only sets citedUrl/snippet when isCited is true", async () => {
    const results = await provider.checkVisibility("example.com", ["a", "b", "c", "d", "e"]);
    for (const r of results) {
      if (r.isCited) {
        expect(r.citedUrl).not.toBeNull();
        expect(r.snippet).not.toBeNull();
      } else {
        expect(r.citedUrl).toBeNull();
        expect(r.snippet).toBeNull();
      }
    }
  });
});
