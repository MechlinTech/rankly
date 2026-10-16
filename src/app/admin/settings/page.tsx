"use client";

import Link from "next/link";
import { AdminSettingsView } from "@/components/admin/admin-settings-view";

export default function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb / Top Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Link href="/admin" className="font-medium hover:text-slate-900 dark:hover:text-white transition">
          Super Admin
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">API Settings & Integrations</span>
      </div>

      <AdminSettingsView />
    </div>
  );
}
