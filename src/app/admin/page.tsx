"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge, Card, CardHeader } from "@/components/ui";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  memberCount: number;
  projectCount: number;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface AdminData {
  metrics: {
    totalTenants: number;
    totalUsers: number;
    activeTenants: number;
    trialingTenants: number;
    suspendedTenants: number;
  };
  tenants: TenantRow[];
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "TRIALING") return "info" as const;
  if (status === "SUSPENDED") return "critical" as const;
  return "neutral" as const;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/tenants");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Platform overview</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Aggregate metrics across all tenants. Tenant business data (keywords, audits, CRM
          content) is intentionally not shown here.
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Tenants", value: data.metrics.totalTenants },
            { label: "Users", value: data.metrics.totalUsers },
            { label: "Active", value: data.metrics.activeTenants },
            { label: "Trialing", value: data.metrics.trialingTenants },
            { label: "Suspended", value: data.metrics.suspendedTenants },
          ].map((m) => (
            <Card key={m.label} className="p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{m.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Tenants" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3 font-medium">Projects</th>
                <th className="px-5 py-3 font-medium">Billing</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data?.tenants.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3">
                    <Link href={`/admin/tenants/${t.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone="neutral">{t.plan}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{t.memberCount}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{t.projectCount}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                    {t.stripeCustomerId ? "Connected" : "No billing account"}
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
