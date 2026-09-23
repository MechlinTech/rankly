const IN_PLACE = [
  "Bcrypt password hashing (cost factor 12)",
  "Opaque, revocable sessions — only a SHA-256 hash of the session token is stored server-side",
  "httpOnly, secure (in production), sameSite=lax session cookies",
  "Role-based access control enforced server-side on every mutating route, not just hidden in the UI",
  "Tenant isolation — every API route derives its tenant from the authenticated session, never from client input",
  "OAuth CSRF protection via signed state validated on callback",
  "Stripe webhook signature verification",
  "Input validation (zod) on every API route",
  "Generic auth error messages to prevent user/email enumeration",
  "Per-tenant, per-IP rate limiting on sensitive endpoints",
];

const IN_PROGRESS = [
  "Formal third-party penetration testing",
  "SOC 2 / ISO 27001 certification (not certified — see COMPLIANCE.md)",
  "Multi-factor authentication",
  "Centralized security event alerting",
  "Distributed (multi-instance) rate limiting",
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Security</h1>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        We build toward strong industry security practices. This page distinguishes controls that are actually in
        place today from certifications or work still in progress — we don&apos;t claim compliance we don&apos;t
        have.
      </p>

      <h2 className="mt-8 font-semibold text-slate-900 dark:text-white">In place today</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-400">
        {IN_PLACE.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 className="mt-8 font-semibold text-slate-900 dark:text-white">In progress / not yet done</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-400">
        {IN_PROGRESS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-slate-500 dark:text-slate-400">
        Found a security issue? Please contact us through the{" "}
        <a href="/contact" className="underline">
          contact page
        </a>{" "}
        rather than filing a public issue.
      </p>
    </div>
  );
}
