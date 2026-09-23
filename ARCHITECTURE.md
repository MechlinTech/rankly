# Architecture

## Overview

Rankly is a single Next.js 15 (App Router) application serving three surfaces under one origin:

1. **Marketing site** — `src/app/(marketing)/` — public, no auth
2. **Auth pages** — `src/app/login`, `src/app/signup`, `src/app/invite/[token]` — public
3. **Tenant dashboard** — `src/app/(dashboard)/` — authenticated, tenant-scoped
4. **Super-admin portal** — `src/app/admin/` — authenticated, platform-operator only

All three talk to the same Postgres database via Prisma. There is no separate backend service — API routes under `src/app/api/**` are Next.js Route Handlers running in the same deployment.

```
                        ┌─────────────────────────────┐
                        │        Next.js app          │
  Browser  ───────────▶ │  (marketing / auth / dash / │ ───▶ Postgres (Prisma)
                        │   admin + API routes)        │
                        └─────────────────────────────┘
                                │            │
                                ▼            ▼
                          Stripe API   Google/Microsoft OAuth
                          (optional)      (optional)
```

## Request flow: authentication

1. `src/proxy.ts` (Next.js "Proxy" — the renamed `middleware.ts` convention) does a **lightweight cookie-presence check** on protected path prefixes (`/keywords`, `/rankings`, `/audit`, `/team`, `/billing`, `/admin`) and redirects to `/login` if the session cookie is absent. This is a UX fast-path only, not the security boundary.
2. The actual authorization boundary is server-side: `src/lib/auth/session.ts#getCurrentUser()` looks up the session by the SHA-256 hash of the cookie's token, checks expiry/revocation against Postgres, every time.
3. `src/lib/auth/tenant.ts#getCurrentTenantContext()` wraps that with the caller's tenant membership and role. Every dashboard layout and API route derives tenant/role from **this**, never from a client-supplied ID.
4. `src/lib/auth/require-role.ts#requireRole()` adds an RBAC + tenant-suspension check on top, for routes with elevated permissions (team management, billing).

## Tenant isolation model

There is no row-level security (RLS) at the Postgres level yet — isolation is enforced entirely in the application layer: every query that reads or writes tenant data is scoped by a `tenantId` derived from the authenticated session (see `getOrCreateProjectForDomain`, `getOrCreateGeneralProject` in `src/lib/seo/project.ts`, and the `tenantId` filters throughout `src/app/api/**`). This is a real, verified boundary (see `KNOWN_LIMITATIONS.md` for what's been tested), but it means a bug in any single route's `where` clause is a tenant-isolation bug — there's no database-level backstop yet. Adding Postgres RLS policies as defense-in-depth is a reasonable next hardening step, not yet done.

## The SEO engine (adapter pattern)

`src/lib/seo/providers/types.ts` defines interfaces for keyword data, rank tracking, and AI-search visibility. `src/lib/seo/providers/mock.ts` implements all three with deterministic fake data. `src/lib/seo/providers/index.ts` is the factory: it returns the mock unless real credentials are present, in which case it throws (rather than silently returning fake data as if real) until a real adapter is implemented. The site auditor (`src/lib/seo/audit.ts`, `src/lib/seo/crawler/`) is not behind this pattern — it's a real, working crawler today.

## Billing (Stripe adapter)

`src/lib/billing/stripe.ts` wraps the Stripe SDK behind two functions (`getStripeClient`, `verifyWebhookSignature`) so routes never touch the SDK directly. `src/lib/billing/plans.ts` is the single source of truth for plan limits, consumed by both the entitlement checks (`src/lib/billing/entitlements.ts`) and the marketing pricing page — so pricing displayed can't drift from what's enforced.

## Data model

See `DATABASE.md` for the full schema. At a glance: `Tenant` → `Membership` (join to `User`, carries `Role`) → `Project` → `Keyword`/`RankSnapshot`/`SiteAuditRun`/`SiteAuditIssue`/`Competitor`/`AiVisibilitySnapshot`. `AuditLog` and `BillingEvent` are append-only event logs, not user-editable.

## Deployment shape

Cloud-agnostic by design — see `DEPLOYMENT_INSTRUCTIONS.md`. The app is a standard Next.js Node.js server; it runs identically via `next start` behind any reverse proxy, in a Docker container on a physical server, or on a managed platform. Nothing in the codebase assumes AWS specifically.
