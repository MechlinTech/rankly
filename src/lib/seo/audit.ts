import { BasicSiteCrawler } from "./crawler";
import type { CrawledPage } from "./providers/types";

export interface AuditIssue {
  url: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  category: string;
  message: string;
}

const TITLE_MAX_LEN = 60;
const META_DESC_MAX_LEN = 160;
const THIN_CONTENT_WORD_COUNT = 300;
const SLOW_LOAD_MS = 3000;

export function analyzePage(page: CrawledPage): AuditIssue[] {
  const issues: AuditIssue[] = [];

  if (page.statusCode === 0) {
    issues.push({ url: page.url, severity: "CRITICAL", category: "connectivity", message: "Page could not be fetched (network error or timeout)." });
    return issues;
  }
  if (page.statusCode >= 500) {
    issues.push({ url: page.url, severity: "CRITICAL", category: "server-error", message: `Server returned ${page.statusCode}.` });
  }
  if (page.statusCode >= 400 && page.statusCode < 500) {
    issues.push({ url: page.url, severity: "CRITICAL", category: "client-error", message: `Page returned ${page.statusCode}.` });
  }
  if (!page.title) {
    issues.push({ url: page.url, severity: "CRITICAL", category: "on-page", message: "Missing <title> tag." });
  } else if (page.title.length > TITLE_MAX_LEN) {
    issues.push({ url: page.url, severity: "WARNING", category: "on-page", message: `Title is ${page.title.length} chars, longer than recommended ${TITLE_MAX_LEN}.` });
  }
  if (!page.metaDescription) {
    issues.push({ url: page.url, severity: "WARNING", category: "on-page", message: "Missing meta description." });
  } else if (page.metaDescription.length > META_DESC_MAX_LEN) {
    issues.push({ url: page.url, severity: "INFO", category: "on-page", message: `Meta description is ${page.metaDescription.length} chars, longer than recommended ${META_DESC_MAX_LEN}.` });
  }
  if (page.h1Count === 0) {
    issues.push({ url: page.url, severity: "WARNING", category: "on-page", message: "Missing H1 heading." });
  } else if (page.h1Count > 1) {
    issues.push({ url: page.url, severity: "INFO", category: "on-page", message: `Page has ${page.h1Count} H1 tags; expected exactly 1.` });
  }
  if (!page.hasCanonical) {
    issues.push({ url: page.url, severity: "INFO", category: "technical", message: "Missing canonical tag." });
  }
  if (page.wordCount < THIN_CONTENT_WORD_COUNT) {
    issues.push({ url: page.url, severity: "INFO", category: "content", message: `Thin content: ${page.wordCount} words (recommended 300+).` });
  }
  if (page.loadTimeMs !== null && page.loadTimeMs > SLOW_LOAD_MS) {
    issues.push({ url: page.url, severity: "WARNING", category: "performance", message: `Slow response: ${page.loadTimeMs}ms (threshold ${SLOW_LOAD_MS}ms).` });
  }
  if (page.brokenLinks.length > 0) {
    issues.push({ url: page.url, severity: "WARNING", category: "links", message: `${page.brokenLinks.length} unparsable/broken link(s) found.` });
  }

  return issues;
}

export interface AuditRunResult {
  domain: string;
  pagesCrawled: number;
  issues: AuditIssue[];
}

export async function runSiteAudit(domain: string, maxPages = 50): Promise<AuditRunResult> {
  const crawler = new BasicSiteCrawler();
  const pages = await crawler.crawl(domain, maxPages);
  const issues = pages.flatMap(analyzePage);
  return { domain, pagesCrawled: pages.length, issues };
}
