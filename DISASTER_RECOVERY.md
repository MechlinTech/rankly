# Disaster Recovery

## Current state

Backup and restore **scripts** now exist (`scripts/backup-db.sh`, `scripts/restore-db.sh` — also runnable as `npm run db:backup` / `npm run db:restore`), using standard `pg_dump`/`pg_restore` in custom format. **They have not been run in this environment** — the `pg_dump`/`pg_restore` client binaries aren't installed here, so this is standard, well-documented Postgres tooling usage, not experimental code, but it is unexecuted in this build. Your dev manager should run a real backup-then-restore drill against a disposable database before trusting this for production — do not treat RPO/RTO numbers below as commitments until that's done.

## What needs backing up

- **Postgres database** — all tenant data, the entire product. This is the only stateful component; the app itself is stateless (sessions live in Postgres too, not in memory).
- **Environment configuration** (`.env` equivalent in your secret manager) — not "data" to restore, but needed to bring the app back up at all.

There is no file storage (S3-equivalent) in use yet — nothing else to back up today.

## Recommended approach

- If using a managed Postgres provider: enable automated daily backups with point-in-time recovery (most managed providers offer this out of the box) — this is the simplest, most reliable option and should be preferred over self-managed backups.
- If self-hosting Postgres (e.g. the bundled `docker-compose.yml`): schedule `npm run db:backup` (or call `scripts/backup-db.sh` directly with `DATABASE_URL` set) to off-server storage on a regular cadence — e.g. a cron job or CI scheduled workflow. Test restoring it periodically with `npm run db:restore` against a disposable database — an untested backup is not a backup.

## RPO / RTO (proposed, not yet validated)

- **RPO (Recovery Point Objective)**: with daily backups, up to 24 hours of data loss in a worst case. Point-in-time recovery (if your Postgres provider supports it) reduces this significantly — recommended once real customer data exists.
- **RTO (Recovery Time Objective)**: depends entirely on your hosting choice and hasn't been measured. A rough estimate for a small self-hosted deployment: provision a new server/container (minutes), restore the database (minutes to hours depending on size), redeploy the app (minutes). **This has not been timed end-to-end** — do a real drill before quoting this number to anyone.

## Restore procedure (scripted, but unexecuted in this environment — validate before relying on it)

1. Provision a fresh Postgres instance.
2. `DATABASE_URL="postgresql://..." npm run db:restore -- path/to/backup.dump` (wraps `pg_restore`; asks for a typed `yes` confirmation before touching anything, and does not drop the target database for you — that's a deliberate human decision, not automated).
3. Point a fresh app deployment's `DATABASE_URL` at the restored database.
4. Run `npx prisma migrate status` to confirm the schema matches `prisma/migrations/` (run `npx prisma migrate deploy` if the backup predates a migration that's since shipped).
5. Smoke-test: log in as a known account, confirm tenant data is intact.

## What's NOT covered yet

- No documented process for partial data recovery (e.g. one accidentally-deleted tenant, rather than a full-database restore).
- No tested cross-region failover.
- No runbook for "Stripe subscription state drifted from our database" reconciliation — would currently require manual inspection of `BillingEvent` and the Stripe Dashboard.
