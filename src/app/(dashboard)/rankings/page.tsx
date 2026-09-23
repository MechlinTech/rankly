"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from "@/components/ui";
import type { RankCheckResult } from "@/lib/seo/rankings";
import { postJson, UnauthorizedError } from "@/lib/api-client";

function PositionBadge({ position }: { position: number | null }) {
  if (position == null) return <Badge tone="neutral">Not ranking</Badge>;
  if (position <= 3) return <Badge tone="success">#{position}</Badge>;
  if (position <= 10) return <Badge tone="info">#{position}</Badge>;
  if (position <= 20) return <Badge tone="warning">#{position}</Badge>;
  return <Badge tone="neutral">#{position}</Badge>;
}

export default function RankTrackingPage() {
  const router = useRouter();
  const domainId = useId();
  const deviceId = useId();
  const keywordsId = useId();
  const [domain, setDomain] = useState("");
  const [termsInput, setTermsInput] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankCheckResult | null>(null);

  async function runCheck() {
    const terms = termsInput
      .split(/\n|,/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!domain.trim() || terms.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const data = await postJson<RankCheckResult>("/api/seo/rankings", {
        domain: domain.trim(),
        terms,
        device,
      });
      setResult(data);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError("Couldn't check rankings. Please verify the domain and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Rank Tracking</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Check where a domain ranks in search results for a list of keywords.
        </p>
      </div>

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runCheck();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={domainId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Domain
              </label>
              <Input
                id={domainId}
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={deviceId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Device
              </label>
              <select
                id={deviceId}
                value={device}
                onChange={(e) => setDevice(e.target.value as "desktop" | "mobile")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={keywordsId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Keywords (one per line or comma-separated)
            </label>
            <textarea
              id={keywordsId}
              value={termsInput}
              onChange={(e) => setTermsInput(e.target.value)}
              rows={4}
              placeholder={"seo software\nkeyword research tool"}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
            />
          </div>
          <div>
            <Button type="submit" disabled={loading || !domain.trim() || !termsInput.trim()}>
              {loading ? <Spinner /> : "Check Rankings"}
            </Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Card>

      <Card>
        <CardHeader
          title="Results"
          description={
            result?.isMockData
              ? "Showing mock data — no SERP data provider is connected yet."
              : undefined
          }
        />
        {!result && !loading && (
          <EmptyState
            title="No rankings checked yet"
            description="Enter a domain and keyword list above to see current search positions."
          />
        )}
        {result && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Keyword</th>
                  <th className="px-5 py-3 font-medium">Position</th>
                  <th className="px-5 py-3 font-medium">Ranking URL</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row) => (
                  <tr
                    key={row.term}
                    className="border-b border-slate-50 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{row.term}</td>
                    <td className="px-5 py-3">
                      <PositionBadge position={row.position} />
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{row.url ?? "—"}</td>
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
