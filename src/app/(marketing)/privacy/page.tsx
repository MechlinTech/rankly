export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
        Draft placeholder — not reviewed by legal counsel. Do not treat this as a binding privacy policy until it
        has been reviewed and approved for your jurisdiction(s) and actual data practices.
      </p>

      <div className="mt-8 space-y-6 text-sm text-slate-600 dark:text-slate-400">
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">Data we collect</h2>
          <p className="mt-2">
            Account information (name, email, hashed password or OAuth identifier), workspace/tenant data you
            create (projects, keywords, audit results), and standard operational logs (login activity, IP
            address, user agent) for security purposes.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">How we use it</h2>
          <p className="mt-2">
            To provide the product, secure your account, and communicate service-related updates. We do not sell
            personal data.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">Your rights</h2>
          <p className="mt-2">
            Depending on your jurisdiction (e.g. GDPR, CCPA/CPRA), you may have rights to access, export, correct,
            or delete your data. Data export/deletion tooling is planned but not yet built — see
            KNOWN_LIMITATIONS.md in the project repository for current status.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-white">Subprocessors</h2>
          <p className="mt-2">
            When connected, this product may use a hosting provider, a database provider, and (once configured) a
            payment processor and email delivery service. A complete subprocessor list will be published here once
            those providers are finalized for production.
          </p>
        </section>
      </div>
    </div>
  );
}
