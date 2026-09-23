# Rankly (working name — confirm domain before launch)

A multi-tenant SEO / AI-search intelligence platform in the spirit of SEMrush and Ahrefs, targeted at SEO and digital marketing teams. See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) for what is real vs. mocked today, and [PRODUCTION_GATES.md](./PRODUCTION_GATES.md) for what's required before each deployment stage.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma (7, using the `@prisma/adapter-pg` driver adapter)
- Tailwind CSS
- Deployment target: plain Docker (works on a physical server or any cloud VM — not AWS-locked)

## What's built so far

- Multi-tenant + RBAC data model (`prisma/schema.prisma`): tenants, users, memberships, invitations, sessions, OAuth accounts, audit log
- SEO engine domain model: projects, keywords, rank snapshots, competitors, site audit runs/issues, AI-search visibility snapshots, AI usage log
- **Real email/password auth**: signup, login, logout, bcrypt password hashing, opaque revocable sessions (DB-backed, httpOnly cookies). Signup creates a tenant + OWNER membership. Protected routes (`/keywords`, `/rankings`, `/audit`) require a valid session (`src/middleware.ts` + `src/lib/auth/`).
- **Real, working site auditor** (`src/lib/seo/audit.ts`, `src/lib/seo/crawler`): same-origin crawler using `fetch` + `cheerio`, flags missing titles/meta/H1/canonical, thin content, slow responses, broken links, 4xx/5xx.
- **Keyword research + rank tracking UI** (`/keywords`, `/rankings`) on top of adapter interfaces for keyword data, rank tracking, and AI-search visibility (`src/lib/seo/providers`), each with a mock implementation. Real providers (DataForSEO, SerpApi, etc.) are not implemented — the factory throws clearly if credentials are present but the adapter isn't, rather than silently faking results.
- All three tools persist their results to Postgres, scoped to the authenticated tenant's project — verified against real DB rows, not just API responses.
- **Team invitations + RBAC** (`/team`): owners/admins invite by email + role, manage roles, deactivate/remove members. Role checks are enforced server-side on every route, not just hidden in the UI. Invites attempt real email delivery (see below) and fall back to a manually shared link if that's not configured.
- **Email verification + forgot/reset password** (`src/lib/email/`, via Resend): signup sends a verification email; unverified users see a dashboard banner with a resend option. Forgot-password never reveals whether an email exists, and a successful reset revokes every existing session for that user. Verified end-to-end against real DB rows with no Resend key configured (the graceful-fallback path); the actual Resend API call is untested (no API key in this environment).
- **Google/Microsoft OAuth** (`src/lib/auth/oauth/`): real OAuth 2.0 authorization-code flow for both providers. Correctly reports "not configured" without real credentials; the actual provider round-trip is untested (no Google/Microsoft test credentials in this environment).
- **Billing** (`/billing`, `src/lib/billing/`): real Stripe integration (checkout, billing portal, webhook handling with signature verification + idempotency) and real plan-based entitlement enforcement (e.g. FREE plan blocks a 2nd team member with a 402). Correctly reports "not configured" without a Stripe key; the actual Stripe round-trip is untested (no Stripe test-mode key in this environment).
- **Super-admin portal** (`/admin`): platform-wide tenant list and aggregate metrics, without exposing tenant business data. Suspending a tenant is a real enforced control — verified to block both the dashboard UI and the SEO API routes, not just cosmetic. No self-service path to become a super admin (`scripts/promote-super-admin.ts` requires DB access) — least privilege by design.
- **Marketing site** (`src/app/(marketing)/`): one-page site at `/` plus `/pricing`, `/security`, `/privacy`, `/terms`, `/contact`. Pricing renders from the same plan config billing enforces, so it can't drift. Legal pages are explicitly labeled draft/not-legal-reviewed. No fake logos, testimonials, or metrics.
- **PWA**: manifest, generated icons, offline fallback page, and a service worker (caches only the offline page, never API responses). All assets verified serving correctly; live install/offline behavior on a real device is not yet confirmed (see `KNOWN_LIMITATIONS.md`).
- **Production build**: `npm run build` (standalone output) succeeds, and the standalone server was verified running against real Postgres. `Dockerfile` + `docker-compose.yml` are included; the Docker build itself hasn't been run (no Docker in this dev environment).
- **CRM / business workspace** (`/crm`): companies, contacts, tasks, and an activity/notes timeline with automatic stage-change logging. Search and stage filtering built in. Verified end-to-end in-browser, including tenant isolation (a second tenant sees zero of the first tenant's CRM data).
- **Automated tests + CI**: `npm test` (39 unit tests), `npm run test:integration` (11 tests, real server + real Postgres over HTTP), and `npm run test:e2e` (27 Playwright tests, real Chromium + real server + real Postgres, including a broken-link/broken-image sweep and an axe-core WCAG 2.2 AA accessibility scan across every route) — all passing. This work found and fixed **three real application bugs**, not just test artifacts: a dev-mode Next.js UI element was physically intercepting real clicks on the dashboard's Log out button (confirmed by reproducing it with an actual coordinate click in a live browser); every form label in the app was visually but not programmatically associated with its input — a genuine WCAG 2.2 AA violation, fixed across all 8 affected forms; and a widespread WCAG color-contrast failure (bare `text-slate-400` at 2.63:1 against white, well under the 4.5:1 AA minimum) across 26 files, fixed to `text-slate-500` (~4.77:1). Also found and fixed a too-tight signup rate limit, an incorrect test expectation, and a real `npm ci` bug (`@types/node@^20` vs. `vitest@5`'s peer requirement). `.github/workflows/ci.yml` runs unit + integration on every push (E2E isn't in CI yet); neither job has executed in GitHub yet. See `TEST_PLAN.md`.

## What's NOT built yet

"Remember this device"/MFA, multi-tenant switching for users in more than one tenant, E2E tests in CI, and real load/pen testing/third-party data providers. See `KNOWN_LIMITATIONS.md`.

## Documentation

`README.md` (this file) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) · [API.md](./API.md) · [SECURITY.md](./SECURITY.md) · [COMPLIANCE.md](./COMPLIANCE.md) · [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) · [DEPLOYMENT_INSTRUCTIONS.md](./DEPLOYMENT_INSTRUCTIONS.md) · [OPERATIONS.md](./OPERATIONS.md) · [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) · [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) · [TEST_PLAN.md](./TEST_PLAN.md) · [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) · [PRODUCTION_GATES.md](./PRODUCTION_GATES.md)

## Local development

```bash
cp .env.example .env
# Local Postgres without Docker (Docker isn't available in this dev environment):
npx prisma dev --detach
# then set DATABASE_URL in .env to the connection string it prints
npx prisma migrate dev
npm run dev
```

Run the unit test suite anytime with `npm test` (no database needed). Run `npm run test:integration` once Postgres is up to exercise real auth/tenant-isolation/RBAC flows over HTTP. Run `npm run test:e2e` (needs Postgres + Playwright's Chromium, `npx playwright install chromium`) for full real-browser coverage including the broken-link/broken-image sweep.

(`docker-compose.yml` + `Dockerfile` are also provided for environments where Docker is available, e.g. your physical server — see `DEPLOYMENT_INSTRUCTIONS.md`.)

## Deployment

Cloud-agnostic via Docker. No AWS-specific services required; deploys the same way to a physical server, a VPS, or any container host. Full steps in `DEPLOYMENT_INSTRUCTIONS.md`.
