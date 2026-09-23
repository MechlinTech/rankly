import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { LogoutButton } from "@/components/logout-button";
import { VerifyEmailBanner } from "@/components/verify-email-banner";

const NAV_ITEMS = [
  { href: "/keywords", label: "Keyword Research" },
  { href: "/rankings", label: "Rank Tracking" },
  { href: "/audit", label: "Site Audit" },
  { href: "/crm", label: "CRM" },
  { href: "/team", label: "Team" },
  { href: "/billing", label: "Billing" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    redirect("/login");
  }

  if (ctx.tenant.status === "SUSPENDED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Workspace suspended</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {ctx.tenant.name} has been suspended. Contact support for details.
          </p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 sm:flex">
        <div className="mb-8 px-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Rankly
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="truncate px-2 text-xs font-medium text-slate-700 dark:text-slate-300">{ctx.tenant.name}</p>
          <p className="truncate px-2 text-xs text-slate-500">{ctx.user.email}</p>
          <div className="mt-2 px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="safe-top fixed inset-x-0 top-0 z-10 flex items-center gap-4 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
        <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-white">Rankly</span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            {item.label}
          </Link>
        ))}
        <span className="ml-auto shrink-0">
          <LogoutButton />
        </span>
      </div>

      <main className="safe-bottom flex-1 pb-10 pt-20 sm:pt-8">
        {!ctx.user.emailVerified && <VerifyEmailBanner />}
        <div className="mx-auto max-w-5xl px-4 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
