"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from "@/components/ui";
import type { KeywordResearchResult } from "@/lib/seo/keywords";
import { postJson, UnauthorizedError } from "@/lib/api-client";

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return <span className="text-slate-500">—</span>;
  const tone =
    intent === "transactional" ? "success" : intent === "commercial" ? "info" : intent === "navigational" ? "warning" : "neutral";
  return <Badge tone={tone as never}>{intent}</Badge>;
}

export default function KeywordResearchPage() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeywordResearchResult | null>(null);

  async function runResearch() {
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJson<KeywordResearchResult>("/api/seo/keywords", { term: term.trim() });
      setResult(data);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError("Couldn't fetch keyword data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const rows = result ? [result.seed, ...result.related] : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Keyword Research</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Find search volume, difficulty, and related terms for a seed keyword.
        </p>
      </div>

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runResearch();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Input
            placeholder="e.g. project management software"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Seed keyword"
          />
          <Button type="submit" disabled={loading || !term.trim()}>
            {loading ? <Spinner /> : "Research"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Card>

      <Card>
        <CardHeader
          title="Results"
          description={
            result?.isMockData
              ? "Showing mock data — no keyword data provider is connected yet."
              : undefined
          }
        />
        {!result && !loading && (
          <EmptyState
            title="No keywords yet"
            description="Enter a seed keyword above to see search volume, difficulty, and related terms."
          />
        )}
        {result && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Keyword</th>
                  <th className="px-5 py-3 font-medium">Volume</th>
                  <th className="px-5 py-3 font-medium">Difficulty</th>
                  <th className="px-5 py-3 font-medium">CPC</th>
                  <th className="px-5 py-3 font-medium">Intent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.term}
                    className={`border-b border-slate-50 last:border-0 dark:border-slate-800/60 ${
                      i === 0 ? "bg-slate-50/60 font-medium dark:bg-slate-800/30" : ""
                    }`}
                  >
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-200">
                      {row.term}
                      {i === 0 && (
                        <span className="ml-2">
                          <Badge tone="neutral">seed</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                      {row.searchVolume?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{row.difficulty ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                      {row.cpc != null ? `$${row.cpc.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <IntentBadge intent={row.intent} />
                    </td>
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
