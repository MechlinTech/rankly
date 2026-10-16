"use client";

import { useEffect, useId, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Pagination, paginateItems } from "@/components/ui";
import {
  validateCompanyName,
  validateCompanyDomain,
  cleanDomain,
  formatCrmError,
} from "@/lib/crm/validation";

type Stage = "LEAD" | "PROSPECT" | "CLIENT" | "CHURNED";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  stage: Stage;
  tags: string[];
  updatedAt: string;
  _count: { contacts: number; tasks: number };
}

const STAGE_TONE: Record<Stage, "neutral" | "info" | "success" | "warning"> = {
  LEAD: "neutral",
  PROSPECT: "info",
  CLIENT: "success",
  CHURNED: "warning",
};

const AVATAR_GRADIENTS = [
  "from-indigo-600 to-violet-600",
  "from-sky-600 to-blue-600",
  "from-emerald-600 to-teal-600",
  "from-amber-600 to-orange-600",
  "from-rose-600 to-pink-600",
  "from-purple-600 to-indigo-600",
];

function getAvatarGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CrmPage() {
  const router = useRouter();
  const nameId = useId();
  const domainId = useId();

  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "">("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalCompanies = companies?.length ?? 0;
  const maxPage = Math.max(1, Math.ceil(totalCompanies / pageSize));
  const currentPage = Math.min(Math.max(1, page), maxPage);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (stageFilter) params.set("stage", stageFilter);
    const res = await fetch(`/api/crm/companies?${params.toString()}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setCompanies(data.companies);
  }, [search, stageFilter, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount and on filter change
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = validateCompanyName(name);
    const domErr = validateCompanyDomain(domain);

    if (nameErr || domErr) {
      setNameError(nameErr);
      setDomainError(domErr);
      return;
    }

    setCreating(true);
    setNameError(null);
    setDomainError(null);
    setGeneralError(null);

    try {
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGeneralError(formatCrmError(data.error, "Couldn't create company."));
        return;
      }
      setName("");
      setDomain("");
      await load();
    } catch {
      setGeneralError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  // Quick stats
  const leadCount = companies?.filter((c) => c.stage === "LEAD").length ?? 0;
  const prospectCount = companies?.filter((c) => c.stage === "PROSPECT").length ?? 0;
  const clientCount = companies?.filter((c) => c.stage === "CLIENT").length ?? 0;
  const totalTasks = companies?.reduce((sum, c) => sum + (c._count.tasks ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">CRM</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Track companies, contacts, tasks, and activity history for your accounts.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Accounts</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{totalCompanies}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pipeline (Leads/Prospects)</p>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{leadCount + prospectCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Paying Clients</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{clientCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Tasks</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{totalTasks}</p>
        </div>
      </div>

      {/* Add Company Card */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Add New Account</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1 min-w-0">
            <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Company name <span className="text-rose-500">*</span>
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
                if (generalError) setGeneralError(null);
              }}
              placeholder="Acme Inc."
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
            />
            {nameError && (
              <p id={`${nameId}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                {nameError}
              </p>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <label htmlFor={domainId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Domain (optional)
            </label>
            <Input
              id={domainId}
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                if (domainError) setDomainError(null);
                if (generalError) setGeneralError(null);
              }}
              placeholder="acme.com"
              aria-invalid={Boolean(domainError)}
              aria-describedby={domainError ? `${domainId}-error` : undefined}
            />
            {domainError && (
              <p id={`${domainId}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                {domainError}
              </p>
            )}
          </div>

          <div className="sm:pt-6 shrink-0">
            <Button type="submit" disabled={creating || !name.trim()} className="w-full sm:w-auto">
              {creating ? "Adding…" : "Add company"}
            </Button>
          </div>
        </form>

        {generalError && (
          <p role="alert" className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
            {generalError}
          </p>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs min-w-0">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search companies…"
            className="pl-9"
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <select
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value as Stage | "");
            setPage(1);
          }}
          aria-label="Filter by stage"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 cursor-pointer"
        >
          <option value="">All stages</option>
          <option value="LEAD">Lead</option>
          <option value="PROSPECT">Prospect</option>
          <option value="CLIENT">Client</option>
          <option value="CHURNED">Churned</option>
        </select>

        {(search || stageFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStageFilter("");
              setPage(1);
            }}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Companies List / Table */}
      <Card className="min-w-0">
        <CardHeader
          title="Companies"
          description={
            companies
              ? `Showing ${paginateItems(companies, currentPage, pageSize).length} of ${companies.length} account${
                  companies.length === 1 ? "" : "s"
                }`
              : undefined
          }
        />

        {companies && companies.length === 0 && (
          <EmptyState
            title="No companies yet"
            description={
              search || stageFilter
                ? "No companies match your search criteria. Try clearing filters."
                : "Add your first company above to start tracking it."
            }
          />
        )}

        {companies && companies.length > 0 && (
          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium min-w-[220px]">Company Name</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Stage</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Contacts</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Open tasks</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Updated</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {paginateItems(companies, currentPage, pageSize).map((c) => (
                  <tr
                    key={c.id}
                    className="group transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3 min-w-[220px] max-w-[340px]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${getAvatarGradient(
                            c.name
                          )} text-xs font-bold text-white shadow-2xs`}
                        >
                          {getInitials(c.name)}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <Link
                            href={`/crm/${c.id}`}
                            title={c.name}
                            className="font-medium text-slate-900 transition hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400 break-words [overflow-wrap:anywhere] [word-break:break-word]"
                          >
                            {c.name}
                          </Link>
                          {c.domain && (
                            <span
                              className="text-xs text-slate-500 dark:text-slate-400 break-all [overflow-wrap:anywhere]"
                              title={c.domain}
                            >
                              {cleanDomain(c.domain)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Badge tone={STAGE_TONE[c.stage]}>{c.stage}</Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        {c._count.contacts}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        {c._count.tasks}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {new Date(c.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-right">
                      <Link
                        href={`/crm/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        View
                        <svg className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {companies && companies.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={companies.length}
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
    </div>
  );
}
