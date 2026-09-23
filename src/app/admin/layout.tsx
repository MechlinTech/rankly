import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    redirect("/keywords");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
          Rankly — Super Admin
        </span>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
