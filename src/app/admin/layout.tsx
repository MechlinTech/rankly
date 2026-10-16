import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    redirect("/keywords");
  }

  const userInitials = (user.name || user.email.split("@")[0] || "AD")
    .slice(0, 2)
    .toUpperCase();
  const displayName = user.name || user.email.split("@")[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Super Admin Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 py-2.5 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95 shadow-2xs">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2.5 hover:opacity-90 transition group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-slate-900 to-indigo-900 text-white shadow-xs dark:from-indigo-600 dark:to-violet-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Rankly</span>
                {/* <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 uppercase tracking-wider">
                  Super Admin
                </span> */}
              </div>
              <span className="text-[10px] text-slate-400">Platform Management Console</span>
            </div>
          </Link>

          <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800"></div>

          <Link
            href="/keywords"
            id="admin-to-workspace-btn"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition group"
            title="Switch to Tenant Workspace"
          >
            <span>Tenant Workspace</span>
            <svg className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>

        {/* User Info, Theme Toggle & Styled Logout Button */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <ThemeToggle />

          {/* User profile card */}
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/60 py-1 pl-1.5 pr-3 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold text-white shadow-2xs dark:bg-white dark:text-slate-900">
              {userInitials}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                {displayName}
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1 leading-tight">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                <span>Root Admin</span>
              </span>
            </div>
          </div>

          {/* Styled Logout Button */}
          <LogoutButton
            showIcon
            label="Log out"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 dark:hover:border-rose-900 transition shadow-2xs cursor-pointer"
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
