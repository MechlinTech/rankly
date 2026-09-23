# Database

PostgreSQL, accessed via Prisma 7 with the `@prisma/adapter-pg` driver adapter (required since Prisma 7 removed the schema-level `datasource.url`). Schema source of truth: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.

**For whoever deploys this**: the deployable schema artifact is the `prisma/migrations/` directory (4 migrations as of this build), applied with `npx prisma migrate deploy` — never hand-run SQL, never `prisma db push` against a shared environment (see `DEPLOYMENT_INSTRUCTIONS.md` step 2). For backup/restore, use `npm run db:backup` / `npm run db:restore` (`scripts/backup-db.sh` / `scripts/restore-db.sh`, standard `pg_dump -Fc` / `pg_restore` — see `DISASTER_RECOVERY.md`). Both scripts are unexecuted in this build (no `pg_dump`/`pg_restore` client tools in this environment) — run a real backup-then-restore drill before depending on them.

## Entity overview

### Tenancy & auth
- **Tenant** — one workspace/company account. Holds plan, status (`ACTIVE`/`TRIALING`/`SUSPENDED`/`CANCELED`), and Stripe billing fields (`stripeCustomerId`, `stripeSubscriptionId`, `billingInterval`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEndsAt`).
- **User** — a person. Can belong to multiple tenants via `Membership`, though the app currently only surfaces one primary tenant per session (v1 simplification, see `KNOWN_LIMITATIONS.md`). `isSuperAdmin` grants platform-operator access, set only via `scripts/promote-super-admin.ts` (no self-service path).
- **Membership** — join table between `Tenant` and `User`, carrying `Role` (`OWNER`/`ADMIN`/`MANAGER`/`MEMBER`/`VIEWER`) and `isActive`.
- **Invitation** — a pending/accepted/expired/revoked invite by email, scoped to a tenant.
- **Session** — one active login. Stores a SHA-256 hash of the session token (never the raw token), expiry, and revocation timestamp.
- **OAuthAccount** — links a `User` to a `(provider, providerUserId)` pair for Google/Microsoft sign-in.
- **AuditLog** — append-only account/security event log (`tenant.created`, `invitation.accepted`, `membership.updated`, `tenant.suspended_by_admin`, etc.). Not business data.

### SEO engine
- **Project** — one tracked domain (or, for keyword-only research, a placeholder "general" project) within a tenant.
- **Keyword** — a tracked term with cached metrics (volume/difficulty/CPC/intent), unique per `(projectId, term, locale)`.
- **RankSnapshot** — a point-in-time ranking position for a keyword, engine, and device.
- **Competitor** — a competitor domain tracked against a project.
- **SiteAuditRun** / **SiteAuditIssue** — one crawl run and the issues it found.
- **AiVisibilitySnapshot** — whether a domain was cited for a term on a given AI-search engine.
- **AiActivityLog** — token/cost tracking for any AI-backed feature (not yet wired to a real LLM call).

### Billing
- **BillingEvent** — every processed Stripe webhook event, keyed by `stripeEventId` for idempotency, with the raw payload retained.

## Multi-tenancy strategy

Shared schema, shared tables, tenant discriminator column (`tenantId`) on every tenant-owned table. No schema-per-tenant, no database-per-tenant. This is the simplest and most common approach for a SaaS at this stage; see `ARCHITECTURE.md` for the isolation model and its current limits (app-layer enforcement, no Postgres RLS yet).

## Migrations

Run with `npx prisma migrate dev` (development) or `npx prisma migrate deploy` (staging/production — never `migrate dev` against a shared environment). The current migration history:

1. `20260917122611_init` — initial schema (tenancy, auth, RBAC, SEO engine)
2. `20260917130000_add_billing` — Stripe fields on `Tenant` + `BillingEvent`

## Local development database

This environment has no Docker, so local development used Prisma's built-in `prisma dev` (an ephemeral local Postgres server, not for production). `docker-compose.yml` is provided for environments where Docker is available (e.g. a physical server) — see `DEPLOYMENT_INSTRUCTIONS.md`.

## Known gaps

- No Postgres row-level security policies (defense-in-depth beyond app-layer tenant scoping).
- No read replicas / connection pooling configuration documented yet (relevant once load-testing happens — see `KNOWN_LIMITATIONS.md`).
- No backup/restore procedure has been executed against this schema yet — see `DISASTER_RECOVERY.md` for what's planned vs. done.
