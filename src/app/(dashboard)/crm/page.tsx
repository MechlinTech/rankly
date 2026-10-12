"use client";

import { useEffect, useId, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Pagination, paginateItems } from "@/components/ui";
import { validateCompanyName, formatCrmError } from "@/lib/crm/validation";

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
  const [error, setError] = useState<string | null>(null);
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
    const validationError = validateCompanyName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(formatCrmError(data.error, "Couldn't create company."));
        return;
      }
      setName("");
      setDomain("");
      await load();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">CRM</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Track companies, contacts, tasks, and activity history for your accounts.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Company name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Acme Inc."
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${nameId}-error` : undefined}
            />
          </div>
          <div className="flex-1">
            <label htmlFor={domainId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Domain (optional)
            </label>
            <Input id={domainId} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          </div>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? "Adding…" : "Add company"}
          </Button>
        </form>
        {error && (
          <p id={`${nameId}-error`} role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search companies…"
          className="sm:max-w-xs"
        />
        <select
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value as Stage | "");
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          <option value="">All stages</option>
          <option value="LEAD">Lead</option>
          <option value="PROSPECT">Prospect</option>
          <option value="CLIENT">Client</option>
          <option value="CHURNED">Churned</option>
        </select>
      </div>

      <Card>
        <CardHeader title="Companies" />
        {companies && companies.length === 0 && (
          <EmptyState title="No companies yet" description="Add your first company above to start tracking it." />
        )}
        {companies && companies.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium min-w-[200px] max-w-[320px]">Name</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Stage</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Contacts</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Open tasks</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Updated</th>
                </tr>
              </thead>
              <tbody>
                {paginateItems(companies, currentPage, pageSize).map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-3 min-w-[200px] max-w-[320px]">
                      <div className="flex flex-col gap-0.5 max-w-[320px]">
                        <Link
                          href={`/crm/${c.id}`}
                          title={c.name}
                          className="font-medium text-slate-900 hover:underline dark:text-white line-clamp-2 break-words [overflow-wrap:anywhere]"
                        >
                          {c.name}
                        </Link>
                        {c.domain && (
                          <span className="truncate text-xs text-slate-500" title={c.domain}>
                            {c.domain}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Badge tone={STAGE_TONE[c.stage]}>{c.stage}</Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{c._count.contacts}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{c._count.tasks}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {new Date(c.updatedAt).toLocaleDateString()}
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
