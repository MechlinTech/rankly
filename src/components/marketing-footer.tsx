import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4 sm:px-8">
        <div>
          <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Rankly</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            SEO and AI-search intelligence for marketing teams.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li><Link href="/#features" className="hover:text-slate-900 dark:hover:text-white">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li><Link href="/contact" className="hover:text-slate-900 dark:hover:text-white">Contact / Support</Link></li>
            <li><Link href="/security" className="hover:text-slate-900 dark:hover:text-white">Security</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li><Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-slate-900 dark:hover:text-white">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-900 sm:px-8">
        © {new Date().getFullYear()} Rankly. Working name — not a launched commercial product.
      </div>
    </footer>
  );
}
