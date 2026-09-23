"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { PLANS } from "@/lib/billing/plans";

interface MeResponse {
  user: { email: string } | null;
  tenant: { name: string; plan: keyof typeof PLANS } | null;
  role: string;
}

const UPGRADE_PLANS: Array<keyof typeof PLANS> = ["STARTER", "GROWTH", "SCALE"];

export default function BillingPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const data: MeResponse = await res.json();
    if (!data.user) {
      router.push("/login");
      return;
    }
    setMe(data);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  const canManage = me?.role === "OWNER" || me?.role === "ADMIN";
  const currentPlan = me?.tenant?.plan ?? "FREE";

  async function upgrade(planId: keyof typeof PLANS) {
    setError(null);
    setBusyPlan(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval: "MONTHLY" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start checkout.");
        return;
      }
      // eslint-disable-next-line react-hooks/immutability -- external redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError("Couldn't start checkout.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't open billing portal.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't open billing portal.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Billing</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your plan and subscription.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Current plan</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {PLANS[currentPlan].name}
            </p>
          </div>
          {canManage && currentPlan !== "FREE" && (
            <Button variant="secondary" onClick={openPortal}>
              Manage billing
            </Button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Card>

      <Card>
        <CardHeader
          title="Plans"
          description="Pricing is a proposal — not yet connected to a live Stripe account. See KNOWN_LIMITATIONS.md."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {UPGRADE_PLANS.map((planId) => {
            const plan = PLANS[planId];
            const isCurrent = planId === currentPlan;
            return (
              <div
                key={planId}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{plan.name}</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    ${plan.monthlyPriceUsd}
                    <span className="text-sm font-normal text-slate-500">/mo</span>
                  </p>
                </div>
                <ul className="flex-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <li>{plan.maxTeamMembers} team members</li>
                  <li>{plan.maxProjects} projects</li>
                  <li>{plan.maxAuditsPerMonth} audits / month</li>
                  <li>{plan.maxKeywordsTracked.toLocaleString()} keywords tracked</li>
                </ul>
                {isCurrent ? (
                  <Badge tone="success">Current plan</Badge>
                ) : canManage ? (
                  <Button onClick={() => upgrade(planId)} disabled={busyPlan === planId}>
                    {busyPlan === planId ? "Redirecting…" : "Upgrade"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
