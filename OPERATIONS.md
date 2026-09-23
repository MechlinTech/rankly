# Operations

## Runbook: common tasks

### Promote a user to super admin
```bash
npx tsx scripts/promote-super-admin.ts someone@example.com
```
Requires direct database access (`DATABASE_URL` set). No in-app way to do this — intentional (see `SECURITY.md`).

### Suspend/reactivate a tenant
Log in as a super admin, go to `/admin/tenants/[id]`, click "Suspend workspace" / "Reactivate". This is enforced immediately (see `KNOWN_LIMITATIONS.md`) — no restart needed.

### Run database migrations
```bash
npx prisma migrate deploy   # staging/production
npx prisma migrate dev      # local development only
```

### Inspect the database directly
`scripts/check-db.ts` is a starting point for ad-hoc queries during development (`npx tsx scripts/check-db.ts`). For production, use your Postgres provider's console or `psql` directly — don't run ad-hoc scripts with production credentials casually.

### Back up and restore the database
```bash
DATABASE_URL="postgresql://..." npm run db:backup            # writes to ./backups/rankly-<timestamp>.dump
DATABASE_URL="postgresql://..." npm run db:restore -- path/to/backup.dump
```
Standard `pg_dump -Fc` / `pg_restore`, requiring those client tools on PATH. See `DISASTER_RECOVERY.md` — these scripts are unexecuted in this build's dev environment; run a real drill before depending on them in production.

## Monitoring (mostly not wired up)

`GET /api/health` exists and does a real DB check (200/503) — point an uptime checker at it. Beyond that, no monitoring, alerting, or dashboards exist yet. Before production launch, put in place at minimum:
- Uptime check against `/api/health`
- Error tracking (e.g. Sentry) for unhandled exceptions in API routes
- A dashboard on: signup rate, login failure rate, audit-run volume, Stripe webhook failure rate, OAuth failure rate — none of this is currently emitted as metrics, only as rows in `AuditLog`/`BillingEvent`

## On-call escalation

Not defined yet — this is a pre-launch product with no on-call rotation. Define this before any real customer depends on uptime.

## Routine maintenance

- Re-run `npm audit` before each deploy (see `SECURITY.md` — Prisma's transitive deps had unpatched advisories as of 2026-09-17; check if a fix has landed).
- Review `AuditLog` periodically for unexpected admin actions (`tenant.suspended_by_admin`, `membership.updated`) if you have multiple super admins.
- Review Stripe Dashboard for failed payments/disputes once billing is live — `invoice.payment_failed` webhook events are recorded in `BillingEvent` but nothing currently acts on them beyond logging (see `KNOWN_LIMITATIONS.md`).
