import * as cheerio from "cheerio";
import type { CrawledPage, SiteCrawler } from "../providers/types";

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 50;

function isSameOrigin(url: URL, origin: string): boolean {
  return url.origin === origin;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "RanklySiteAuditBot/0.1 (+https://example.com/bot)" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Breadth-first same-origin crawler. Real implementation (not mocked) —
 * fetches actual pages and parses actual HTML. No paid API required.
 * Intended for on-demand technical SEO audits, not for scraping third-party sites.
 */
export class BasicSiteCrawler implements SiteCrawler {
  readonly name = "basic-fetch-crawler";

  async crawl(domain: string, maxPages: number = DEFAULT_MAX_PAGES): Promise<CrawledPage[]> {
    const startUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const origin = new URL(startUrl).origin;

    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    const results: CrawledPage[] = [];

    while (queue.length > 0 && results.length < maxPages) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      const started = Date.now();
      try {
        const res = await fetchWithTimeout(currentUrl);
        const loadTimeMs = Date.now() - started;
        const html = await res.text();
        const $ = cheerio.load(html);

        const links: string[] = [];
        const brokenLinks: string[] = [];
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const resolved = new URL(href, currentUrl);
            if (isSameOrigin(resolved, origin) && !visited.has(resolved.toString())) {
              links.push(resolved.toString());
            }
          } catch {
            brokenLinks.push(href);
          }
        });

        results.push({
          url: currentUrl,
          statusCode: res.status,
          title: $("title").first().text() || null,
          metaDescription: $('meta[name="description"]').attr("content") || null,
          h1Count: $("h1").length,
          wordCount: $("body").text().trim().split(/\s+/).filter(Boolean).length,
          hasCanonical: $('link[rel="canonical"]').length > 0,
          brokenLinks,
          loadTimeMs,
        });

        for (const link of links) {
          if (!visited.has(link) && queue.length + results.length < maxPages) {
            queue.push(link);
          }
        }
      } catch {
        results.push({
          url: currentUrl,
          statusCode: 0,
          title: null,
          metaDescription: null,
          h1Count: 0,
          wordCount: 0,
          hasCanonical: false,
          brokenLinks: [],
          loadTimeMs: null,
        });
      }
    }

    return results;
  }
}
