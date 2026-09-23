import Link from "next/link";
import { PricingCards } from "@/components/pricing-cards";

const FEATURES = [
  {
    title: "Keyword research",
    description: "Search volume, difficulty, CPC, and intent for any seed keyword, plus related-term suggestions.",
  },
  {
    title: "Rank tracking",
    description: "Track where your domain ranks for the keywords that matter, by device and search engine.",
  },
  {
    title: "Technical site audits",
    description: "A real crawler flags missing titles, meta descriptions, thin content, broken links, and slow pages.",
  },
  {
    title: "AI-search visibility",
    description: "See whether your content gets cited in AI Overviews and AI-powered answer engines.",
  },
  {
    title: "Team collaboration",
    description: "Invite your team with role-based access — owners, admins, managers, members, and viewers.",
  },
  {
    title: "Multi-tenant workspaces",
    description: "Each workspace is isolated: separate projects, keywords, and team access, one login.",
  },
];

const STEPS = [
  { title: "Create a workspace", description: "Sign up with email or Google/Microsoft, name your workspace, and you're in." },
  { title: "Add a project", description: "Point Rankly at a domain to start tracking rankings and running audits." },
  { title: "Act on the data", description: "Fix what the audit flags, track keyword movement, and bring your team along." },
];

const FAQS = [
  {
    q: "Is this connected to real keyword/ranking data providers?",
    a: "The site auditor runs a real crawl today. Keyword and rank data currently use representative mock data while we finalize a data provider — this is disclosed in-product, not hidden.",
  },
  {
    q: "Can I invite my team?",
    a: "Yes — workspace owners and admins can invite teammates by email with a specific role (admin, manager, member, or viewer).",
  },
  {
    q: "What happens if I go over my plan's limits?",
    a: "You'll see a clear message when an action would exceed your plan (e.g. team size), with the option to upgrade.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, subscription management (upgrade, downgrade, cancel) is handled through Stripe's billing portal, linked from your workspace's Billing page.",
  },
];

export default function MarketingHomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-8 sm:py-28">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          SEO and AI-search intelligence for marketing teams
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-500 dark:text-slate-400">
          Keyword research, rank tracking, and technical site audits in one workspace your whole team can use.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Product screenshot placeholder */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-8">
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Product screenshot placeholder — capture from a real workspace before launch
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
        <h2 className="text-center text-2xl font-semibold text-slate-900 dark:text-white">
          Everything your SEO workflow needs
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 p-6 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-16 dark:bg-slate-900/40">
        <div className="mx-auto max-w-4xl px-4 sm:px-8">
          <h2 className="text-center text-2xl font-semibold text-slate-900 dark:text-white">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title}>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
                  {i + 1}
                </div>
                <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security/compliance */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-8">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Security &amp; compliance</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Bcrypt-hashed passwords, revocable sessions, tenant-isolated data, and role-based access control by
          default. Rankly is built toward strong industry security practices — see our{" "}
          <Link href="/security" className="underline">
            security page
          </Link>{" "}
          for what&apos;s in place today and what&apos;s still in progress. We do not claim certified compliance
          (SOC 2, ISO 27001, etc.) until it is actually audited.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
        <h2 className="text-center text-2xl font-semibold text-slate-900 dark:text-white">Simple, transparent pricing</h2>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          Start free. Upgrade when you need more team members, projects, or audits.
        </p>
        <div className="mt-10">
          <PricingCards />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-slate-50 py-16 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-4 sm:px-8">
          <h2 className="text-center text-2xl font-semibold text-slate-900 dark:text-white">
            Frequently asked questions
          </h2>
          <div className="mt-10 space-y-6">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold text-slate-900 dark:text-white">{f.q}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-8">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Ready to get started?</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No credit card required for the free plan.</p>
        <Link
          href="/signup"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Start free
        </Link>
      </section>
    </div>
  );
}
