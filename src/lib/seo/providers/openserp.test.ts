import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenSerpRankProvider, normalizeDomain, isDomainMatch } from "./openserp";

describe("OpenSerpRankProvider helpers", () => {
  describe("normalizeDomain", () => {
    it("strips http, https, www, and trailing path/port", () => {
      expect(normalizeDomain("https://www.example.com/path")).toBe("example.com");
      expect(normalizeDomain("http://sub.domain.co.uk:8080/")).toBe("sub.domain.co.uk");
      expect(normalizeDomain("acme.org")).toBe("acme.org");
      expect(normalizeDomain("   WWW.UPPERCASE.COM   ")).toBe("uppercase.com");
    });
  });

  describe("isDomainMatch", () => {
    it("matches exact domains", () => {
      expect(isDomainMatch("example.com", "https://example.com/pricing", "example.com")).toBe(true);
      expect(isDomainMatch("www.example.com", undefined, "example.com")).toBe(true);
    });

    it("matches subdomains", () => {
      expect(isDomainMatch("docs.github.com", undefined, "github.com")).toBe(true);
      expect(isDomainMatch(undefined, "https://blog.acme.org/article", "acme.org")).toBe(true);
    });

    it("does not match unrelated domains or different TLDs", () => {
      expect(isDomainMatch("notexample.com", undefined, "example.com")).toBe(false);
      expect(isDomainMatch("myexample.com", "https://myexample.com", "example.com")).toBe(false);
      expect(isDomainMatch("example.com.au", undefined, "example.com")).toBe(false);
      expect(isDomainMatch("example.co", undefined, "example.com")).toBe(false);
    });
  });
});

describe("OpenSerpRankProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws if API key is empty", () => {
    expect(() => new OpenSerpRankProvider("")).toThrow("OpenSerpRankProvider requires a non-empty API key.");
    expect(() => new OpenSerpRankProvider("   ")).toThrow();
  });

  it("identifies as non-mock", () => {
    const provider = new OpenSerpRankProvider("test-key");
    expect(provider.isMock).toBe(false);
    expect(provider.name).toBe("openserp");
  });

  it("finds ranking position and URL when target domain matches in results", async () => {
    const mockResponse = {
      results: [
        {
          domain: "competitor.com",
          display_url: "https://competitor.com",
          title: "Competitor Rank Tracker",
          snippet: "Best competitor SEO tool",
          position: { rank: 1, type: "organic" },
        },
        {
          domain: "rankly.com",
          display_url: "https://rankly.com/features",
          title: "Rankly SEO Tracking Features",
          snippet: "Accurate real-time rank tracking",
          position: { rank: 2, type: "organic" },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const provider = new OpenSerpRankProvider("test-key");
    const [result] = await provider.getRankings("rankly.com", ["rank tracking"]);

    expect(result.term).toBe("rank tracking");
    expect(result.position).toBe(2);
    expect(result.url).toBe("https://rankly.com/features");
    expect(result.title).toBe("Rankly SEO Tracking Features");
    expect(result.snippet).toBe("Accurate real-time rank tracking");
    expect(result.page).toBe(1);
    expect(result.topCompetitor?.domain).toBe("competitor.com");
    expect(result.engine).toBe("google");
    expect(result.device).toBe("desktop");
  });

  it("selects the best (lowest) rank when multiple URLs match the domain", async () => {
    const mockResponse = {
      results: [
        {
          domain: "example.com",
          display_url: "https://example.com/blog/article-1",
          position: { rank: 15, type: "organic" },
        },
        {
          domain: "example.com",
          display_url: "https://example.com/homepage",
          position: { rank: 3, type: "organic" },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const provider = new OpenSerpRankProvider("test-key");
    const [result] = await provider.getRankings("example.com", ["keyword"]);

    expect(result.position).toBe(3);
    expect(result.url).toBe("https://example.com/homepage");
  });

  it("returns position: null and url: null when target domain is not in search results", async () => {
    const mockResponse = {
      results: [
        {
          domain: "other.com",
          display_url: "https://other.com",
          position: { rank: 1, type: "organic" },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const provider = new OpenSerpRankProvider("test-key");
    const [result] = await provider.getRankings("notfound.com", ["test"]);

    expect(result.position).toBeNull();
    expect(result.url).toBeNull();
  });

  it("retries on HTTP 429 rate limit", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          status: 429,
          ok: false,
          text: async () => "Rate limit exceeded",
        } as unknown as Response;
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({
          results: [{ domain: "acme.com", position: { rank: 5 } }],
        }),
      } as unknown as Response;
    });

    const provider = new OpenSerpRankProvider("test-key");
    const [result] = await provider.getRankings("acme.com", ["term"]);

    expect(callCount).toBe(2);
    expect(result.position).toBe(5);
  });

  it("propagates authentication error on 401/403", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      text: async () => "Unauthorized",
    } as unknown as Response);

    const provider = new OpenSerpRankProvider("bad-key");
    await expect(provider.getRankings("example.com", ["term"])).rejects.toThrow("invalid or unauthorized");
  });

  it("handles network exceptions gracefully by returning null rank", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const provider = new OpenSerpRankProvider("test-key");
    const [result] = await provider.getRankings("example.com", ["error test"]);

    expect(result.position).toBeNull();
    expect(result.url).toBeNull();
    expect(result.term).toBe("error test");
  });

  it("processes multiple keywords in parallel with concurrency mapping", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    const provider = new OpenSerpRankProvider("test-key");
    const results = await provider.getRankings("example.com", ["k1", "k2", "k3", "k4", "k5"]);

    expect(results).toHaveLength(5);
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);
  });

  it("extracts related searches and questions without treating answers as keywords", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        serp_features: [
          {
            type: "related_searches",
            items: [{ title: "keyword research tool" }, { text: "keyword research software" }],
          },
          {
            type: "people_also_ask",
            items: [{ title: "What is keyword research?", text: "A process for finding useful search terms." }],
          },
        ],
      }),
    } as unknown as Response);

    const provider = new OpenSerpRankProvider("test-key");
    const ideas = await provider.getRelatedKeywords("keyword research", "en-US", 10);
    const requestUrl = new URL((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);

    expect(ideas).toEqual([
      "keyword research tool",
      "keyword research software",
      "What is keyword research?",
    ]);
    expect(requestUrl.searchParams.get("text")).toBe("keyword research");
    expect(requestUrl.searchParams.get("lang")).toBe("EN");
    expect(requestUrl.searchParams.get("region")).toBe("US");
    expect(requestUrl.searchParams.get("features")).toBe("true");
  });

  it("returns fallback related keywords when OpenSERP times out or has a network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    const provider = new OpenSerpRankProvider("test-key");
    const ideas = await provider.getRelatedKeywords("coffee", "en-US", 5);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas[0]).toContain("coffee");
  });

  it("returns fallback related keywords when OpenSERP returns HTTP 502 Bad Gateway", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    } as Response);

    const provider = new OpenSerpRankProvider("test-key");
    const ideas = await provider.getRelatedKeywords("coffee", "en-US", 5);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas[0]).toContain("coffee");
  });
});
