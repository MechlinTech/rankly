"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from "@/components/ui";
import type { AuditRunResult } from "@/lib/seo/audit";
import { postJson, UnauthorizedError } from "@/lib/api-client";

function SeverityBadge({ severity }: { severity: "CRITICAL" | "WARNING" | "INFO" }) {
  const tone = severity === "CRITICAL" ? "critical" : severity === "WARNING" ? "warning" : "info";
  return <Badge tone={tone}>{severity}</Badge>;
}

export default function SiteAuditPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditRunResult | null>(null);

  async function runAudit() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJson<AuditRunResult>("/api/seo/audit", { domain: domain.trim(), maxPages: 10 });
      setResult(data);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't audit that domain.");
    } finally {
      setLoading(false);
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
            onChange={(e) => setDomain(e.target.value)}
            aria-label="Domain to audit"
          />
          <Button type="submit" disabled={loading || !domain.trim()}>
            {loading ? <Spinner /> : "Run Audit"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
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
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">URL</th>
                  <th className="px-5 py-3 font-medium">Issue</th>
                </tr>
              </thead>
              <tbody>
                {result.issues.map((issue, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-3">
                      <SeverityBadge severity={issue.severity} />
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{issue.category}</td>
                    <td className="max-w-[240px] truncate px-5 py-3 text-slate-500 dark:text-slate-400" title={issue.url}>
                      {issue.url}
                    </td>
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
