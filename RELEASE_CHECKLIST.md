# Release Checklist

Use this before shipping any change to a shared environment (staging or production). Check `PRODUCTION_GATES.md` for the broader readiness picture — this checklist is per-release, not per-project.

## Before merging

- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint src` passes
- [ ] `npm test` passes (unit suite — no database needed)
- [ ] `npm run build` succeeds
- [ ] CI is green (`.github/workflows/ci.yml` runs all four checks above automatically on push/PR)
- [ ] If the schema changed: a real migration file exists in `prisma/migrations/` (not just a local `db push`), and it was tested against a fresh database
- [ ] New/changed API routes have their auth/RBAC/tenant-scoping reviewed — this is the single most common way to introduce a tenant-isolation bug in this codebase (see `ARCHITECTURE.md`)
- [ ] New env vars are documented in `ENVIRONMENT_VARIABLES.md` and added to `.env.example` (with a placeholder, never a real value)
- [ ] `KNOWN_LIMITATIONS.md` updated if the change closes or introduces a known gap

## Before deploying to staging

- [ ] `npx prisma migrate deploy` run against staging's database
- [ ] Staging env vars reviewed (separate from production — see `DEPLOYMENT_INSTRUCTIONS.md`)
- [ ] Manual smoke test of the changed flow in staging

## Before deploying to production

- [ ] Staging smoke test passed
- [ ] Database backup taken immediately before the migration (see `DISASTER_RECOVERY.md`)
- [ ] Rollback plan confirmed (previous container image available, migration is additive/backward-compatible where possible)
- [ ] If billing/OAuth config changed: verify webhook/callback URLs match production's real domain

## After deploying to production

- [ ] Smoke test in production (signup or login, one core action per major surface: keyword research, rank tracking, site audit)
- [ ] Check error tracking/logs for new errors in the minutes after deploy (once monitoring exists — see `OPERATIONS.md`, not yet wired up)

## What CI does and doesn't cover

`.github/workflows/ci.yml` runs type-check, lint, unit tests, and a production build on every push/PR — but it has never actually run yet (it ships in this commit; no push has triggered it). The staging/production deployment steps below are not automated at all — they still rely on the person deploying running through them by hand.
