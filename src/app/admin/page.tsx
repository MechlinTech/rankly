"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Badge, Card, CardHeader, Pagination, paginateItems, Spinner } from "@/components/ui";
import { AdminSettingsView } from "@/components/admin/admin-settings-view";

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

function AdminMainContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const isSettingsParam =
    tabParam === "settings" ||
    tabParam === "search" ||
    tabParam === "ai" ||
    tabParam === "email" ||
    tabParam === "billing" ||
    tabParam === "auth";

  const activeTab: "tenants" | "settings" = isSettingsParam ? "settings" : "tenants";

  const [data, setData] = useState<AdminData | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalTenants = data?.tenants?.length ?? 0;
  const maxPage = Math.max(1, Math.ceil(totalTenants / pageSize));
  const currentPage = Math.min(Math.max(1, page), maxPage);

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenants");
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    loadTenants();
  }, [loadTenants]);

  function switchTab(tab: "tenants" | "settings") {
    const url = tab === "settings" ? "/admin?tab=settings" : "/admin";
    router.replace(url, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Admin Control Center
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Manage multi-tenant workspaces, platform health, and third-party API service integrations.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
          <button
            type="button"
            onClick={() => switchTab("tenants")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "tenants"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span>Tenants & Workspaces</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab("settings")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "settings"
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>API Settings & Checks</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Tenants Overview */}
      {activeTab === "tenants" && (
        <div className="flex flex-col gap-6">
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
                  {paginateItems(data?.tenants ?? [], currentPage, pageSize).map((t) => (
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
            {data?.tenants && data.tenants.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalItems={data.tenants.length}
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
      )}

      {/* Tab 2: Settings & Instant Diagnostic Testing */}
      {activeTab === "settings" && <AdminSettingsView />}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-xs text-slate-400">Loading admin panel…</p>
        </div>
      }
    >
      <AdminMainContent />
    </Suspense>
  );
}
