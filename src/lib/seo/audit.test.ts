import { describe, it, expect } from "vitest";
import { analyzePage } from "./audit";
import type { CrawledPage } from "./providers/types";

function makePage(overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url: "https://example.com",
    statusCode: 200,
    title: "A perfectly reasonable title",
    metaDescription: "A perfectly reasonable meta description that is not too long.",
    h1Count: 1,
    wordCount: 500,
    hasCanonical: true,
    brokenLinks: [],
    loadTimeMs: 500,
    ...overrides,
  };
}

describe("analyzePage", () => {
  it("returns no issues for a clean page", () => {
    expect(analyzePage(makePage())).toEqual([]);
  });

  it("flags a network failure as the only issue, short-circuiting other checks", () => {
    const issues = analyzePage(makePage({ statusCode: 0, title: null, hasCanonical: false }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "CRITICAL", category: "connectivity" });
  });

  it("flags 5xx as a critical server error", () => {
    const issues = analyzePage(makePage({ statusCode: 503 }));
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "CRITICAL", category: "server-error", message: "Server returned 503." })
    );
  });

  it("flags 4xx as a critical client error", () => {
    const issues = analyzePage(makePage({ statusCode: 404 }));
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "CRITICAL", category: "client-error", message: "Page returned 404." })
    );
  });

  it("flags a missing title as critical", () => {
    const issues = analyzePage(makePage({ title: null }));
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "CRITICAL", category: "on-page", message: "Missing <title> tag." })
    );
  });

  it("flags an overly long title as a warning, not critical", () => {
    const issues = analyzePage(makePage({ title: "x".repeat(61) }));
    expect(issues).toContainEqual(expect.objectContaining({ severity: "WARNING", category: "on-page" }));
  });

  it("flags a missing meta description as a warning", () => {
    const issues = analyzePage(makePage({ metaDescription: null }));
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "WARNING", message: "Missing meta description." })
    );
  });

  it("flags zero H1s and more than one H1", () => {
    expect(analyzePage(makePage({ h1Count: 0 }))).toContainEqual(
      expect.objectContaining({ message: "Missing H1 heading." })
    );
    expect(analyzePage(makePage({ h1Count: 3 }))).toContainEqual(
      expect.objectContaining({ message: "Page has 3 H1 tags; expected exactly 1." })
    );
  });

  it("flags missing canonical tag as info", () => {
    const issues = analyzePage(makePage({ hasCanonical: false }));
    expect(issues).toContainEqual(expect.objectContaining({ severity: "INFO", category: "technical" }));
  });

  it("flags thin content under 300 words", () => {
    const issues = analyzePage(makePage({ wordCount: 50 }));
    expect(issues).toContainEqual(
      expect.objectContaining({ category: "content", message: "Thin content: 50 words (recommended 300+)." })
    );
  });

  it("does not flag content at exactly the threshold or above", () => {
    expect(analyzePage(makePage({ wordCount: 300 })).some((i) => i.category === "content")).toBe(false);
  });

  it("flags slow responses over 3000ms", () => {
    const issues = analyzePage(makePage({ loadTimeMs: 5000 }));
    expect(issues).toContainEqual(expect.objectContaining({ category: "performance" }));
  });

  it("does not flag performance when loadTimeMs is null (unmeasured)", () => {
    expect(analyzePage(makePage({ loadTimeMs: null })).some((i) => i.category === "performance")).toBe(false);
  });

  it("flags broken links with a count in the message", () => {
    const issues = analyzePage(makePage({ brokenLinks: ["a", "b", "c"] }));
    expect(issues).toContainEqual(
      expect.objectContaining({ category: "links", message: "3 unparsable/broken link(s) found." })
    );
  });
});
