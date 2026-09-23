"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

export function MarketingNav() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setIsLoggedIn(!!data.user);
    } catch {
      setIsLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial auth check on mount
    check();
  }, [check]);

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Rankly
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400 sm:flex">
          <Link href="/#features" className="hover:text-slate-900 dark:hover:text-white">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white">
            Pricing
          </Link>
          <Link href="/#faq" className="hover:text-slate-900 dark:hover:text-white">
            FAQ
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <Link
              href="/keywords"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Start free
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
