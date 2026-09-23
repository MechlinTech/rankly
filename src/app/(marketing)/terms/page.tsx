export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Terms of Service</h1>
      <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
        Draft placeholder — not reviewed by legal counsel. Do not treat this as a binding agreement until reviewed
        and finalized.
      </p>

      <div className="mt-8 space-y-6 text-sm text-slate-600 dark:text-slate-400">
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">The service</h2>
          <p className="mt-2">
            Rankly is provided on an &quot;as is&quot; basis during this pre-launch phase. Features described on
            this site may change before a commercial launch.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">Accounts</h2>
          <p className="mt-2">
            You&apos;re responsible for activity under your account and for keeping your credentials secure.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">Billing</h2>
          <p className="mt-2">
            Paid plans are billed through Stripe. Subscriptions renew automatically unless canceled; you can
            manage or cancel a subscription from your workspace&apos;s Billing page.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">Termination</h2>
          <p className="mt-2">
            We may suspend a workspace for violations of these terms or non-payment. You may cancel at any time.
          </p>
        </section>
      </div>
    </div>
  );
}
