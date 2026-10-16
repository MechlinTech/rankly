"use client";

import { useId, useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Pagination, paginateItems, Spinner } from "@/components/ui";
import type { RankCheckResult } from "@/lib/seo/rankings";
import type { SerpResult } from "@/lib/seo/providers/types";
import { postJson, UnauthorizedError } from "@/lib/api-client";
import { normalizeDomain } from "@/lib/seo/providers/openserp";

function formatVolume(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

function formatCpc(val: number | null | undefined): string {
  if (val == null) return "—";
  return `$${val.toFixed(2)}`;
}

function PositionBadge({ position }: { position: number | null }) {
  if (position == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        &gt; 100 Unranked
      </span>
    );
  }
  if (position === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 shadow-2xs">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        <span>#1 Top Rank</span>
      </span>
    );
  }
  if (position <= 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        <span>#{position} Top 3</span>
      </span>
    );
  }
  if (position <= 10) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/70">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
        <span>#{position} Page 1</span>
      </span>
    );
  }
  if (position <= 20) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
        #{position} Page 2
      </span>
    );
  }
  const pageNum = Math.ceil(position / 10);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      #{position} (Page {pageNum})
    </span>
  );
}

function DeltaBadge({ change, previous }: { change?: number | null; previous?: number | null }) {
  if (previous === null || previous === undefined) {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        NEW
      </span>
    );
  }
  if (change === null || change === undefined || change === 0) {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        0
      </span>
    );
  }
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
        <span>+{change}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
      <span>{change}</span>
    </span>
  );
}

function IntentBadge({ intent }: { intent?: string | null }) {
  if (!intent) return null;
  const lower = intent.toLowerCase();
  let toneClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  if (lower === "transactional") {
    toneClass = "bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400";
  } else if (lower === "commercial") {
    toneClass = "bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-950/30 dark:text-purple-400";
  } else if (lower === "informational") {
    toneClass = "bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/30 dark:text-sky-400";
  } else if (lower === "navigational") {
    toneClass = "bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400";
  }

  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${toneClass}`}>
      {lower}
    </span>
  );
}

function DifficultyMeter({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const isEasy = score < 35;
  const isMed = score >= 35 && score < 70;
  const label = isEasy ? "Easy" : isMed ? "Medium" : "Hard";
  const colorClass = isEasy
    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400"
    : isMed
    ? "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400"
    : "text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400";

  return (
    <div className="flex items-center gap-1.5" title={`Keyword Difficulty: ${score}% (${label})`}>
      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${colorClass}`}>
        {score}%
      </span>
      <span className="text-[10px] text-slate-400 hidden sm:inline">{label}</span>
    </div>
  );
}

export default function RankTrackingPage() {
  const router = useRouter();
  const domainId = useId();
  const deviceId = useId();
  const engineId = useId();
  const keywordsId = useId();

  const [domain, setDomain] = useState("");
  const [termsInput, setTermsInput] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [engine, setEngine] = useState<"google" | "bing">("google");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankCheckResult | null>(null);

  // Filters & Sorting state
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("position_asc");
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const parsedTerms = termsInput
    .split(/\n|,/)
    .map((t) => t.trim())
    .filter(Boolean);

  const uniqueTerms = Array.from(new Set(parsedTerms.map((t) => t.toLowerCase())));

  // Computed summary metrics across all results
  const metrics = useMemo(() => {
    if (!result || result.results.length === 0) return null;
    const total = result.results.length;
    const rankingItems = result.results.filter((r) => r.position !== null);
    const top3 = result.results.filter((r) => r.position !== null && r.position <= 3).length;
    const top10 = result.results.filter((r) => r.position !== null && r.position <= 10).length;
    const page2Count = result.results.filter((r) => r.position !== null && r.position > 10 && r.position <= 20).length;
    const page3PlusCount = result.results.filter((r) => r.position !== null && r.position > 20).length;
    const unranked = result.results.filter((r) => r.position === null).length;
    const improved = result.results.filter((r) => r.positionChange != null && r.positionChange > 0).length;
    const declined = result.results.filter((r) => r.positionChange != null && r.positionChange < 0).length;

    const avgPos =
      rankingItems.length > 0
        ? (rankingItems.reduce((acc, curr) => acc + (curr.position ?? 0), 0) / rankingItems.length).toFixed(1)
        : "—";

    const visibilityPct = Math.round((top10 / total) * 100);

    return {
      total,
      top3,
      top10,
      page2Count,
      page3PlusCount,
      unranked,
      improved,
      declined,
      avgPos,
      visibilityPct,
      rankingCount: rankingItems.length,
    };
  }, [result]);

  // Filtered and sorted results
  const filteredResults = useMemo(() => {
    if (!result) return [];
    let list = [...result.results];

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.term.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q) ||
          r.url?.toLowerCase().includes(q) ||
          r.topCompetitor?.domain?.toLowerCase().includes(q)
      );
    }

    // Filter Chips
    if (activeFilter === "TOP3") {
      list = list.filter((r) => r.position !== null && r.position <= 3);
    } else if (activeFilter === "TOP10") {
      list = list.filter((r) => r.position !== null && r.position <= 10);
    } else if (activeFilter === "PAGE2") {
      list = list.filter((r) => r.position !== null && r.position > 10 && r.position <= 20);
    } else if (activeFilter === "PAGE3_PLUS") {
      list = list.filter((r) => r.position !== null && r.position > 20);
    } else if (activeFilter === "UNRANKED") {
      list = list.filter((r) => r.position === null);
    } else if (activeFilter === "IMPROVED") {
      list = list.filter((r) => r.positionChange != null && r.positionChange > 0);
    } else if (activeFilter === "DECLINED") {
      list = list.filter((r) => r.positionChange != null && r.positionChange < 0);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "position_asc") {
        const posA = a.position ?? 9999;
        const posB = b.position ?? 9999;
        return posA - posB;
      }
      if (sortBy === "position_desc") {
        const posA = a.position ?? -1;
        const posB = b.position ?? -1;
        return posB - posA;
      }
      if (sortBy === "volume_desc") {
        const volA = a.metrics?.searchVolume ?? -1;
        const volB = b.metrics?.searchVolume ?? -1;
        return volB - volA;
      }
      if (sortBy === "difficulty_asc") {
        const diffA = a.metrics?.difficulty ?? 9999;
        const diffB = b.metrics?.difficulty ?? 9999;
        return diffA - diffB;
      }
      if (sortBy === "difficulty_desc") {
        const diffA = a.metrics?.difficulty ?? -1;
        const diffB = b.metrics?.difficulty ?? -1;
        return diffB - diffA;
      }
      if (sortBy === "term_asc") {
        return a.term.localeCompare(b.term);
      }
      return 0;
    });

    return list;
  }, [result, searchQuery, activeFilter, sortBy]);

  const totalFiltered = filteredResults.length;
  const maxPage = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPage = Math.min(Math.max(1, page), maxPage);

  async function runCheck() {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) {
      setError("Please enter a valid domain name (e.g. example.com).");
      return;
    }

    if (uniqueTerms.length === 0) {
      setError("Please enter at least one keyword term to track.");
      return;
    }

    if (uniqueTerms.length > 50) {
      setError("You can check a maximum of 50 keywords at one time.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await postJson<RankCheckResult>("/api/seo/rankings", {
        domain: cleanDomain,
        terms: uniqueTerms,
        engine,
        device,
      });
      setResult(data);
      setPage(1);
      setActiveFilter("ALL");
      setSearchQuery("");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      const msg = err instanceof Error ? err.message : "Couldn't check rankings. Please verify the domain and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  function exportCsv() {
    if (!result || result.results.length === 0) return;
    const headers = [
      "Keyword",
      "Position",
      "Previous Position",
      "Change",
      "Page",
      "Result Type",
      "Ranking Title",
      "Ranking URL",
      "Monthly Search Volume",
      "Keyword Difficulty (%)",
      "Estimated CPC ($)",
      "Search Intent",
      "Top #1 Competitor Domain",
      "Top #1 Competitor URL",
      "Checked At",
    ];

    const rows = result.results.map((r) => [
      `"${r.term.replace(/"/g, '""')}"`,
      r.position ?? "Unranked",
      r.previousPosition ?? "",
      r.positionChange ?? "",
      r.page ?? "",
      r.resultType ?? "organic",
      `"${(r.title ?? "").replace(/"/g, '""')}"`,
      `"${(r.url ?? "").replace(/"/g, '""')}"`,
      r.metrics?.searchVolume ?? "",
      r.metrics?.difficulty ?? "",
      r.metrics?.cpc ?? "",
      r.metrics?.intent ?? "",
      `"${(r.topCompetitor?.domain ?? "").replace(/"/g, '""')}"`,
      `"${(r.topCompetitor?.url ?? "").replace(/"/g, '""')}"`,
      new Date(r.capturedAt).toISOString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `rankings_${result.domain}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function loadSamplePreset() {
    setDomain("github.com");
    setTermsInput(
      "git\ngithub actions\nopen source repository\npull request code review\ncontinuous integration ci cd"
    );
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              Search Engine Rank Tracker
            </h1>
            <Badge tone="success">Google SERP Engine</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Real-time organic search ranking intelligence, SERP snippet previews, search intent, and competitor tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={loadSamplePreset}
            className="text-xs cursor-pointer"
          >
            Load Sample Terms
          </Button>
          {result && result.results.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={exportCsv}
              className="text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* Configuration & Input Card */}
      <Card className="p-5 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runCheck();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={domainId} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Domain <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <Input
                  id={domainId}
                  placeholder="e.g. acme.com or https://company.com"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => {
                    if (domain.trim()) {
                      setDomain(normalizeDomain(domain));
                    }
                  }}
                  className="pl-9 font-medium placeholder:font-normal"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Bare domain or URL (e.g. github.com)
              </p>
            </div>

            <div>
              <label htmlFor={engineId} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Search Engine
              </label>
              <select
                id={engineId}
                value={engine}
                onChange={(e) => setEngine(e.target.value as "google" | "bing")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800 cursor-pointer"
              >
                <option value="google">Google Search (Global & Local)</option>
                <option value="bing">Microsoft Bing Search</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Default: Google Organic Search
              </p>
            </div>

            <div>
              <label htmlFor={deviceId} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Device Index
              </label>
              <select
                id={deviceId}
                value={device}
                onChange={(e) => setDevice(e.target.value as "desktop" | "mobile")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800 cursor-pointer"
              >
                <option value="desktop">Desktop Web Crawler</option>
                <option value="mobile">Mobile SmartPhone Index</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Matches user agent screen layout
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={keywordsId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Keywords <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {uniqueTerms.length} keyword{uniqueTerms.length === 1 ? "" : "s"} (max 50)
                </span>
                {termsInput && (
                  <button
                    type="button"
                    onClick={() => setTermsInput("")}
                    className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              id={keywordsId}
              value={termsInput}
              onChange={(e) => {
                setTermsInput(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              placeholder={"Enter keywords to track (one per line or comma-separated)\ne.g.\ncloud ranking software\norganic search optimization\nserp competitor intelligence"}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 placeholder:font-sans focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              One keyword per line or comma-separated. Maximum 50 terms per batch.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>OpenSERP API connected & verified</span>
            </div>

            <Button
              type="submit"
              disabled={loading || !domain.trim() || uniqueTerms.length === 0}
              className="cursor-pointer"
            >
              {loading ? (
                <>
                  <Spinner />
                  <span className="ml-2">Scanning Search Engine SERPs…</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Check Rankings Now</span>
                </>
              )}
            </Button>
          </div>
        </form>

        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60">
            <svg className="h-4 w-4 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
      </Card>

      {/* KPI Overview Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Tracked</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.total}</span>
              <span className="text-[11px] text-slate-400">keywords</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {metrics.rankingCount} ranking in Top 100
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Average Position</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {metrics.avgPos !== "—" ? `#${metrics.avgPos}` : "—"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Across all ranking terms
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Top 3 (Podium)</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.top3}</span>
              <span className="text-xs font-medium text-emerald-600/80">high traffic tier</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Captures ~55% of all clicks
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Page 1 Visibility</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics.visibilityPct}%</span>
              <span className="text-xs text-slate-400">({metrics.top10}/{metrics.total})</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Positions 1 through 10
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900 col-span-2 sm:col-span-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Unranked / Beyond 100</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-500 dark:text-slate-400">{metrics.unranked}</span>
              <span className="text-xs text-slate-400">terms</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Opportunity keywords to optimize
            </p>
          </div>
        </div>
      )}

      {/* Main Results Card */}
      <Card className="min-w-0">
        <CardHeader
          title="Search Ranking Results"
          badge={
            result ? (
              result.isMockData ? (
                <Badge tone="mock">Mock Engine</Badge>
              ) : (
                <Badge tone="success">Live Google SERP Data</Badge>
              )
            ) : undefined
          }
          description={
            result
              ? `Verified search rankings for ${result.domain} on Google (${result.device}) with SERP snippets, keyword volume, and competitors.`
              : "Run a rank check above to display detailed Google positions, search snippets, and keyword intelligence."
          }
        />

        {!result && !loading && (
          <EmptyState
            title="No rankings checked yet"
            description="Enter your target domain and keyword list above, then click 'Check Rankings Now' to scan Google search positions in real time."
          />
        )}

        {result && (
          <div className="p-5 flex flex-col gap-4">
            {/* Filter Chips & Search Controls */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "ALL", label: `All (${metrics?.total ?? 0})` },
                  { key: "TOP3", label: `Top 3 (${metrics?.top3 ?? 0})` },
                  { key: "TOP10", label: `Page 1 (${metrics?.top10 ?? 0})` },
                  { key: "PAGE2", label: `Page 2 (${metrics?.page2Count ?? 0})` },
                  { key: "PAGE3_PLUS", label: `Page 3+ (${metrics?.page3PlusCount ?? 0})` },
                  { key: "UNRANKED", label: `Unranked (${metrics?.unranked ?? 0})` },
                  ...(metrics?.improved ? [{ key: "IMPROVED", label: `Improved (${metrics.improved})` }] : []),
                  ...(metrics?.declined ? [{ key: "DECLINED", label: `Dropped (${metrics.declined})` }] : []),
                ].map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                      setActiveFilter(chip.key);
                      setPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      activeFilter === chip.key
                        ? "bg-slate-900 text-white shadow-2xs dark:bg-white dark:text-slate-900"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Search & Sort Controls */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="relative w-44 sm:w-56">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <Input
                    placeholder="Filter keywords..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="pl-8 text-xs py-1.5"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
                >
                  <option value="position_asc">Rank (Best First)</option>
                  <option value="position_desc">Rank (Lowest First)</option>
                  <option value="volume_desc">Search Volume (High → Low)</option>
                  <option value="difficulty_asc">SEO Difficulty (Easy First)</option>
                  <option value="difficulty_desc">SEO Difficulty (Hard First)</option>
                  <option value="term_asc">Keyword A → Z</option>
                </select>
              </div>
            </div>

            {/* Results Table */}
            {totalFiltered === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                No keywords match the selected filter or search term.
              </div>
            ) : (
              <div className="overflow-x-auto min-w-0">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800">
                      <th className="py-2.5 px-3 font-semibold w-44">Keyword & Intent</th>
                      <th className="py-2.5 px-3 font-semibold w-36 whitespace-nowrap">Google Position</th>
                      <th className="py-2.5 px-3 font-semibold w-32 whitespace-nowrap">Volume & Difficulty</th>
                      <th className="py-2.5 px-3 font-semibold min-w-0">Ranking SERP Snippet</th>
                      <th className="py-2.5 px-3 font-semibold w-36">#1 Competitor</th>
                      <th className="py-2.5 px-3 font-semibold w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {paginateItems(filteredResults, currentPage, pageSize).map((row: SerpResult) => {
                      const isExpanded = expandedTerm === row.term;
                      const hasSnippet = Boolean(row.title || row.snippet);

                      return (
                        <Fragment key={row.term}>
                          <tr className="group transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            {/* 1. Keyword & Intent */}
                            <td className="py-3 px-3 w-44 align-top">
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 break-words [overflow-wrap:anywhere]">
                                  {row.term}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <IntentBadge intent={row.metrics?.intent} />
                                  {row.resultType && row.resultType !== "organic" && (
                                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 uppercase">
                                      {row.resultType.replace(/_/g, " ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Position & Delta */}
                            <td className="py-3 px-3 w-36 whitespace-nowrap align-top">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <PositionBadge position={row.position} />
                                  <DeltaBadge change={row.positionChange} previous={row.previousPosition} />
                                </div>
                                {row.position && (
                                  <span className="text-[10px] text-slate-400">
                                    {row.position <= 10 ? "Page 1 on Google" : `Page ${Math.ceil(row.position / 10)} on Google`}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 3. Search Volume, KD & CPC */}
                            <td className="py-3 px-3 w-32 whitespace-nowrap align-top">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {formatVolume(row.metrics?.searchVolume)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">/mo</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <DifficultyMeter score={row.metrics?.difficulty} />
                                  {row.metrics?.cpc != null && (
                                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400" title="Estimated CPC">
                                      CPC: {formatCpc(row.metrics.cpc)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 4. Ranking Title, Snippet & URL */}
                            <td className="py-3 px-3 min-w-0 align-top">
                              {row.url ? (
                                <div className="flex flex-col gap-1 max-w-sm">
                                  {/* Title as displayed in SERP */}
                                  {row.title ? (
                                    <a
                                      href={row.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 line-clamp-1"
                                      title={row.title}
                                    >
                                      {row.title}
                                    </a>
                                  ) : (
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                      Ranking URL
                                    </span>
                                  )}

                                  {/* URL Breadcrumb */}
                                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                    <span className="truncate max-w-sm" title={row.url}>
                                      {row.url.replace(/^https?:\/\//i, "")}
                                    </span>
                                  </div>

                                  {/* Google Search Snippet */}
                                  {row.snippet && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                      {row.snippet}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs text-slate-400 italic">Not found in Google top 100</span>
                                  <span className="text-[10px] text-slate-400">
                                    Create targeted content to rank for this term.
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* 5. #1 Competitor Info */}
                            <td className="py-3 px-3 w-36 align-top">
                              {row.position === 1 ? (
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                  <span>Target Domain (#1)</span>
                                </div>
                              ) : row.topCompetitor?.domain ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[130px]" title={row.topCompetitor.title || row.topCompetitor.domain}>
                                    {row.topCompetitor.domain}
                                  </span>
                                  {row.topCompetitor.url && (
                                    <a
                                      href={row.topCompetitor.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-indigo-600 hover:underline dark:text-indigo-400 inline-flex items-center gap-1 truncate max-w-[130px]"
                                    >
                                      <span>View #1 Page</span>
                                      <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>

                            {/* 6. Quick Action Buttons */}
                            <td className="py-3 px-3 w-24 text-right align-top whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Google Search Live Link */}
                                <a
                                  href={`https://www.google.com/search?q=${encodeURIComponent(row.term)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open live Google search in new tab"
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>

                                {/* Copy URL button */}
                                {row.url && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(row.url!)}
                                    title={copiedUrl === row.url ? "Copied!" : "Copy ranking URL"}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                                  >
                                    {copiedUrl === row.url ? (
                                      <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                      </svg>
                                    )}
                                  </button>
                                )}

                                {/* Toggle Google SERP Preview Card */}
                                {hasSnippet && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedTerm(isExpanded ? null : row.term)}
                                    className={`rounded-lg px-2 py-1 text-xs font-semibold transition cursor-pointer ${
                                      isExpanded
                                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                    }`}
                                  >
                                    {isExpanded ? "Hide" : "SERP Card"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Full-width Expanded Google SERP Simulation Row */}
                          {isExpanded && row.url && (
                            <tr className="bg-slate-50/90 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800">
                              <td colSpan={6} className="p-4 sm:p-5">
                                <div className="grid gap-4 lg:grid-cols-3">
                                  {/* Google SERP Snippet Preview (2 cols) */}
                                  <div className="lg:col-span-2 rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-700/80 dark:bg-slate-900">
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        Google Search Result Simulation
                                      </span>
                                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                        Ranked #{row.position} on Google (Page {row.page ?? 1})
                                      </span>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-slate-100 text-[9px] font-bold text-slate-700">G</span>
                                        <span className="truncate max-w-md">{row.url}</span>
                                      </div>
                                      <a
                                        href={row.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-base font-semibold text-blue-700 hover:underline dark:text-blue-400 leading-snug"
                                      >
                                        {row.title || row.term}
                                      </a>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                                        {row.snippet || "No description snippet returned by Google search."}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Competitor & Ranking Intelligence (1 col) */}
                                  <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-700/80 dark:bg-slate-900 flex flex-col justify-between">
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                                        SERP Competitor Intelligence
                                      </p>
                                      {row.position === 1 ? (
                                        <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                          Leading Ranking: You hold position #1 on Google for &quot;{row.term}&quot;.
                                        </div>
                                      ) : row.topCompetitor?.domain ? (
                                        <div className="flex flex-col gap-1.5 text-xs">
                                          <span className="text-slate-500">Currently Holding #1:</span>
                                          <span className="font-bold text-slate-900 dark:text-white">
                                            {row.topCompetitor.domain}
                                          </span>
                                          {row.topCompetitor.title && (
                                            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 italic">
                                              &quot;{row.topCompetitor.title}&quot;
                                            </p>
                                          )}
                                          {row.topCompetitor.url && (
                                            <a
                                              href={row.topCompetitor.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="mt-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400 inline-flex items-center gap-1"
                                            >
                                              <span>Inspect #1 Competitor Page</span>
                                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                              </svg>
                                            </a>
                                          )}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-slate-400">No competitor data found.</p>
                                      )}
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                      <a
                                        href={`https://www.google.com/search?q=${encodeURIComponent(row.term)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 inline-flex items-center gap-1"
                                      >
                                        <span>Open Live Google Search</span>
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(row.url!)}
                                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                                      >
                                        {copiedUrl === row.url ? "Copied!" : "Copy Link"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalFiltered > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Pagination
                  currentPage={currentPage}
                  totalItems={totalFiltered}
                  pageSize={pageSize}
                  pageSizeOptions={[10, 25, 50]}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
