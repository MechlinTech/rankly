import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";
import { SessionGuard } from "@/components/session-guard";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { ThemeToggle } from "@/components/theme-toggle";

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
    const user = await getCurrentUser();
    if (user?.isSuperAdmin) {
      redirect("/admin");
    }
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
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 sm:h-screen sm:overflow-hidden">
      <SessionGuard />
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 sm:flex sm:h-full">
        <div className="mb-8 shrink-0 px-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Rankly
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto min-h-0">
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
        <div className="shrink-0 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="truncate px-2 text-xs font-medium text-slate-700 dark:text-slate-300">{ctx.tenant.name}</p>
          <p className="truncate px-2 text-xs text-slate-500">{ctx.user.email}</p>
          <div className="mt-2 px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0 sm:h-full sm:overflow-hidden">
        {/* Desktop Top Header */}
        <header className="hidden sm:flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-8 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95 shadow-2xs z-10">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{ctx.tenant.name}</span>
            <span>•</span>
            <span className="capitalize">{ctx.membership.role.toLowerCase()}</span>
          </div>

          <div className="flex items-center gap-3">
            {ctx.user.isSuperAdmin && (
              <Link
                href="/admin"
                id="back-to-admin-header-btn"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-700 transition group cursor-pointer"
                title="Return to Super Admin Management Console"
              >
                <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Back to Admin</span>
                <span className="rounded-md bg-slate-200/70 px-1 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  Root
                </span>
              </Link>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile top nav */}
        <div className="safe-top fixed inset-x-0 top-0 z-20 flex items-center gap-3 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
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
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {ctx.user.isSuperAdmin && (
              <Link
                href="/admin"
                id="back-to-admin-mobile-btn"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                title="Return to Super Admin Management Console"
              >
                <span>← Admin</span>
              </Link>
            )}
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>

        <main className="safe-bottom flex-1 pb-10 pt-20 sm:pt-6 min-w-0 sm:h-full sm:overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 sm:px-8">
            {!ctx.user.emailVerified && <VerifyEmailBanner />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
