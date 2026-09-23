# Deployment Instructions

This app is a standard Next.js Node.js server — it does not require any specific cloud provider. These instructions cover the primary target (a physical server or any Linux VM via Docker) with an AWS-equivalent mapping noted where relevant, in case you later choose to host there.

## Prerequisites

- A Linux server (physical or VM) with Docker and Docker Compose installed, **or** Node.js 22+ if running without Docker
- A PostgreSQL 16+ instance reachable from the app (can be the bundled `docker-compose.yml` Postgres container, or an external managed Postgres)
- A domain name with DNS you control, for TLS
- (Optional, only if enabling these features) A Stripe account, a Google Cloud OAuth client, an Azure App Registration, an SMTP/email provider

## 1. Build and run with Docker

```bash
git clone <this-repo> rankly && cd rankly

# Secrets come from GitHub Environments (development / production), not local .env files.
# For a manual deploy on the server, export RANKLY_ENV_FILE to a secrets file first:
#   export RANKLY_ENV_FILE=/secure/path/rankly.env

# Dev (app :43608, postgres host :55998) — does not affect prod containers
RANKLY_ENV_FILE=/secure/path/rankly.dev.env \
  docker compose -p rankly-dev -f docker/docker-compose-dev.yml up -d

# Prod (app :26436, postgres host :2446) — does not affect dev containers
RANKLY_ENV_FILE=/secure/path/rankly.prod.env \
  docker compose -p rankly-prod -f docker/docker-compose-prod.yml up -d
```

Compose files and the multi-stage `docker/Dockerfile` live under `docker/`. CI deploys via `.github/workflows/deploy.yml` on self-hosted runners (`main` → GitHub Environment **development**, `prod` → **production**). Images publish to `akshatpareek/rankly`. See `docker/.env.example` for the secret names to set on each environment.

**`DATABASE_URL` note:** when using the Compose Postgres service, the host inside the URL must be `postgres` and the port `5432` (container-internal), e.g. `postgresql://USER:PASS@postgres:5432/DB`. Host ports `55998` / `2446` are only for connecting from outside Docker.

## 2. Database migrations

Run once per deployment, before starting the new app version:

```bash
npx prisma migrate deploy
```

Never run `prisma migrate dev` against a shared/production database — it can prompt for destructive resets. `migrate deploy` only applies pending migrations from `prisma/migrations/`.

## 3. Reverse proxy and TLS

Put a reverse proxy (nginx, Caddy, or Traefik) in front of the Next.js server to terminate TLS and forward to the app's port (default 3000). Caddy is the simplest for a physical server (automatic Let's Encrypt certificates):

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

AWS equivalent: Application Load Balancer + ACM certificate + target group pointing at ECS/App Runner/EC2.

## 4. Environment variables

See `ENVIRONMENT_VARIABLES.md` for the full list. At minimum, set `DATABASE_URL`. Set OAuth, Stripe, and SMTP variables only once you've actually created those provider accounts — leaving them unset is safe (the app returns clear "not configured" errors rather than fake success).

**Secrets management**: don't ship a `.env` file to your server via `git`/`scp` in the clear if avoidable. Options: Docker secrets, a `.env` file with restricted file permissions (`chmod 600`) outside the git-tracked directory, or (AWS equivalent) Secrets Manager / Parameter Store, injected as environment variables at container start.

## 5. OAuth callback configuration

Once you set `GOOGLE_CLIENT_ID`/`MICROSOFT_CLIENT_ID`, register these exact callback URLs with each provider:

- Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs: `https://<your-domain>/api/auth/oauth/google/callback`
- Azure Portal → App registrations → Authentication → Redirect URIs: `https://<your-domain>/api/auth/oauth/microsoft/callback`

## 6. Stripe configuration

1. Create Products/Prices in the Stripe Dashboard for each plan × interval (Starter/Growth/Scale × monthly/annual) and set their IDs as `STRIPE_PRICE_*` env vars (see `ENVIRONMENT_VARIABLES.md`).
2. Create a webhook endpoint in the Stripe Dashboard pointing at `https://<your-domain>/api/billing/webhook`, subscribed at minimum to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
3. Set `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret.
4. **Test in Stripe test mode before going live** — this has not been tested end-to-end in this build (see `KNOWN_LIMITATIONS.md`).

## 7. Health checks

Point your load balancer/orchestrator health check at `GET /api/health`. It runs a real `SELECT 1` against Postgres and returns `200 {"status":"ok"}` when the database is reachable, `503 {"status":"error"}` otherwise — verified locally in both states (Postgres up and Postgres down). It's intentionally unauthenticated and returns no information beyond up/down.

## 8. Logging and monitoring

No centralized logging/monitoring is wired up. Recommendations:
- Application logs: ship stdout/stderr from the Node process to your log aggregator of choice (self-hosted Loki/Grafana, or a managed service). AWS equivalent: CloudWatch Logs.
- Error tracking: add Sentry or similar (not currently integrated).
- Uptime/health: any external uptime checker against your health endpoint once added.

## 9. Backups

Back up Postgres on whatever schedule your data-loss tolerance requires (see `DISASTER_RECOVERY.md` for RPO/RTO discussion). `npm run db:backup` / `npm run db:restore` (`scripts/backup-db.sh` / `scripts/restore-db.sh`) wrap standard `pg_dump -Fc` / `pg_restore` — schedule the backup script via cron or your platform's scheduled-job feature. If self-hosting Postgres via the bundled Docker Compose, you can also back up the named volume (`rankly_pgdata`) directly as a coarser alternative. A managed Postgres provider typically handles automated backups for you — prefer that over self-managed if available. **Run an actual backup-then-restore drill before depending on any of this** — these scripts haven't been executed in this build's dev environment (no `pg_dump`/`pg_restore` client tools available there).

## 10. Rollback

Standard blue-green or rolling deployment: keep the previous container image tagged, and if the new deploy fails health checks, redirect traffic back to the previous version. Database migrations should be additive/backward-compatible where possible so a rollback of app code doesn't require a matching migration rollback.

## 11. Staging vs. production

Run a separate `.env` (separate `DATABASE_URL`, separate Stripe test-mode keys, separate OAuth clients if the providers require distinct redirect URIs) for staging. Never point staging at production's database or Stripe live-mode keys.

## Troubleshooting

- **App won't start**: check `DATABASE_URL` is set and reachable (`src/lib/db.ts` throws immediately if it's missing).
- **OAuth redirect mismatch error**: the callback URL registered with Google/Microsoft must match the app's actual public origin exactly, including `https://` and no trailing slash.
- **Stripe webhook 400s**: usually a signature mismatch — confirm `STRIPE_WEBHOOK_SECRET` matches the specific webhook endpoint's signing secret in the Stripe Dashboard (each endpoint has its own).
- **Migration errors on deploy**: never run `prisma migrate dev` in production; if migration history is out of sync, use `prisma migrate resolve` deliberately and cautiously (see Prisma's own migration troubleshooting docs) rather than resetting the database.
