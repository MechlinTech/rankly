import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";
import { SessionGuard } from "@/components/session-guard";
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
      <SessionGuard />
      {/* Super Admin Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 py-2.5 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95 shadow-2xs">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="flex flex-col hover:opacity-90 transition group">
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Rankly</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Platform Management Console</span>
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
