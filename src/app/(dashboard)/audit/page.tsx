"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Pagination, paginateItems, Spinner } from "@/components/ui";
import type { AuditRunResult } from "@/lib/seo/audit";
import { postJson, UnauthorizedError } from "@/lib/api-client";

function SeverityBadge({ severity }: { severity: "CRITICAL" | "WARNING" | "INFO" }) {
  const tone = severity === "CRITICAL" ? "critical" : severity === "WARNING" ? "warning" : "info";
  return <Badge tone={tone}>{severity}</Badge>;
}

const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+$/;

export function validateAuditDomain(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 255 || !DOMAIN_REGEX.test(trimmed)) {
    return "Enter a valid domain.";
  }
  return null;
}

export default function SiteAuditPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(AuditRunResult & { auditRunId: string }) | null>(null);
  const [aiInsights, setAiInsights] = useState<{ summary: string; recommendations: { priority: string; title: string; explanation: string; action: string }[]; provider: string; model: string; isFallback: boolean } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalIssues = result?.issues.length ?? 0;
  const maxPage = Math.max(1, Math.ceil(totalIssues / pageSize));
  const currentPage = Math.min(Math.max(1, page), maxPage);

  async function runAudit() {
    const trimmed = domain.trim();
    const validationError = validateAuditDomain(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await postJson<AuditRunResult & { auditRunId: string }>("/api/seo/audit", { domain: trimmed, maxPages: 10 });
      setResult(data);
      setAiInsights(null);
      setAiError(null);
      setPage(1);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Enter a valid domain.");
    } finally {
      setLoading(false);
    }
  }

  async function generateAiInsights() {
    if (!result) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await postJson<{
        insights: { summary: string; recommendations: { priority: string; title: string; explanation: string; action: string }[] };
        provider: string;
        model: string;
        isFallback: boolean;
      }>("/api/seo/ai-insights", { auditRunId: result.auditRunId });
      setAiInsights({ ...data.insights, provider: data.provider, model: data.model, isFallback: data.isFallback });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setAiError(err instanceof Error ? err.message : "AI analysis failed. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Site Audit</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Crawl a domain and surface technical SEO issues. This is a real crawl, not simulated data.
        </p>
      </div>

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAudit();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Input
            placeholder="example.com"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              if (error) setError(null);
            }}
            aria-label="Domain to audit"
            aria-invalid={Boolean(error)}
            className="flex-1 min-w-0"
          />
          <Button type="submit" disabled={loading || !domain.trim()} className="shrink-0">
            {loading ? <Spinner /> : "Run Audit"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400 break-words [overflow-wrap:anywhere]">
            {error}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Issues found"
          description={result ? `Crawled ${result.pagesCrawled} page(s) on ${result.domain}` : undefined}
        />
        {!result && !loading && (
          <EmptyState
            title="No audit run yet"
            description="Enter a domain above to crawl it and check for common technical SEO issues."
          />
        )}
        {result && result.issues.length === 0 && (
          <EmptyState title="No issues found" description="This crawl didn't turn up any of the checks we run for." />
        )}
        {result && result.issues.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Severity</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Category</th>
                  <th className="px-5 py-3 font-medium min-w-[160px] max-w-[260px]">URL</th>
                  <th className="px-5 py-3 font-medium min-w-[200px]">Issue</th>
                </tr>
              </thead>
              <tbody>
                {paginateItems(result.issues, currentPage, pageSize).map((issue, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <SeverityBadge severity={issue.severity} />
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{issue.category}</td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-slate-500 dark:text-slate-400" title={issue.url}>
                      {issue.url}
                    </td>
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-200 break-words [overflow-wrap:anywhere] min-w-[200px]">
                      {issue.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && result.issues.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={result.issues.length}
            pageSize={pageSize}
            pageSizeOptions={[5, 10, 25, 50]}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        )}
      </Card>

      {result && (
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">AI SEO recommendations</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Uses your configured AI provider to prioritize findings from this crawl.</p>
            </div>
            <Button type="button" onClick={generateAiInsights} disabled={aiLoading}>
              {aiLoading ? <Spinner /> : aiInsights ? "Refresh recommendations" : "Generate recommendations"}
            </Button>
          </div>
          {aiError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{aiError}</p>}
          {aiInsights && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">{aiInsights.summary}</p>
              <div className="space-y-3">
                {aiInsights.recommendations.map((recommendation, index) => (
                  <div key={`${recommendation.title}-${index}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{recommendation.title}</span>
                      <Badge tone={recommendation.priority === "High" ? "critical" : recommendation.priority === "Medium" ? "warning" : "info"}>{recommendation.priority}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{recommendation.explanation}</p>
                    <p className="mt-2 text-sm text-slate-800 dark:text-slate-200"><strong>Next step:</strong> {recommendation.action}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">Generated by {aiInsights.provider} ({aiInsights.model}){aiInsights.isFallback ? " via fallback provider" : ""}. This is AI analysis of the crawl results, not a live ranking or AI-search citation check.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
