"use client";

import { use, useEffect, useState, useCallback } from "react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  projectCount: number;
  members: Array<{
    id: string;
    role: string;
    isActive: boolean;
    user: { id: string; email: string; name: string | null; createdAt: string };
  }>;
  recentEvents: Array<{ id: string; action: string; createdAt: string; metadata: unknown }>;
}

export default function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/tenants/${id}`);
    if (res.ok) setTenant(await res.json());
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  async function toggleSuspend() {
    if (!tenant) return;
    setBusy(true);
    const nextStatus = tenant.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    await fetch(`/api/admin/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    await load();
    setBusy(false);
  }

  if (!tenant) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{tenant.name}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tenant.slug}</p>
        </div>
        <Button variant="secondary" onClick={toggleSuspend} disabled={busy}>
          {tenant.status === "SUSPENDED" ? "Reactivate" : "Suspend workspace"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Plan</p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-white">{tenant.plan}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Status</p>
          <Badge tone={tenant.status === "SUSPENDED" ? "critical" : "success"}>{tenant.status}</Badge>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Projects</p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-white">{tenant.projectCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Billing</p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {tenant.stripeCustomerId ? "Stripe connected" : "No billing account"}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Members" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenant.members.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{m.user.name ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{m.user.email}</td>
                  <td className="px-5 py-3">
                    <Badge tone="neutral">{m.role}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? "Active" : "Deactivated"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent security/audit events" description="Account-level events only, not business data." />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {tenant.recentEvents.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{e.action}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
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
