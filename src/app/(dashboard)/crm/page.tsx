"use client";

import { useEffect, useId, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, EmptyState, Input } from "@/components/ui";

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
    if (!name.trim()) return;
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
        setError(data.error ?? "Couldn't create company.");
        return;
      }
      setName("");
      setDomain("");
      await load();
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
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
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
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="sm:max-w-xs"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as Stage | "")}
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
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium">Contacts</th>
                  <th className="px-5 py-3 font-medium">Open tasks</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-3">
                      <Link href={`/crm/${c.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                        {c.name}
                      </Link>
                      {c.domain && <span className="ml-2 text-xs text-slate-500">{c.domain}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STAGE_TONE[c.stage]}>{c.stage}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{c._count.contacts}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{c._count.tasks}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(c.updatedAt).toLocaleDateString()}
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
