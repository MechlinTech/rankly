# Environment Variables

Copy `.env.example` to `.env` for local development. Never commit `.env`. In staging/production, set these through your host's secret manager, not a checked-in file — see `DEPLOYMENT_INSTRUCTIONS.md`.

| Variable | Required | Default behavior if unset | Notes |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | App fails to start (`src/lib/db.ts` throws) | Postgres connection string, used with `@prisma/adapter-pg`. |
| `APP_ENCRYPTION_KEY` | Local development: example provided. Production: optional on this self-hosted deployment workflow | Secret-key features fail closed if no key is available | Stable 32-byte hex/base64 key used to encrypt integration and AI provider credentials. The self-hosted workflow creates a unique key per environment in its persistent runner tool cache when this secret is unset. Back up that key; losing it makes saved credentials unreadable. You may instead set it as a production secret. Never use the development example value in production. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Google sign-in returns 501 | Create in Google Cloud Console → OAuth client. Callback URL: `https://<your-domain>/api/auth/oauth/google/callback`. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | No | Microsoft sign-in returns 501 | Create in Azure Portal → App registrations. Callback URL: `https://<your-domain>/api/auth/oauth/microsoft/callback`. |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | No | Enables live keyword suggestions, search volume, difficulty, and CPC in Keyword Research; requests may incur DataForSEO charges | Add both credentials in Admin → Settings. The DataForSEO Labs live API is used. |
| `OPENSERP_API_KEY` / `SERP_API_KEY` | No | OpenSERP live ranking data and related-search/People Also Ask ideas in Keyword Research; it does not provide volume, difficulty, or CPC metrics | |
| `ANTHROPIC_API_KEY` | No | Not currently used by any built feature | Reserved for a future AI content-assistant feature. |
| `STRIPE_SECRET_KEY` | No | All `/api/billing/*` routes return 501 | Stripe test or live secret key. |
| `STRIPE_WEBHOOK_SECRET` | No | Webhook route returns 501 without a key, 400 with an invalid signature | From your Stripe webhook endpoint's settings. |
| `STRIPE_PRICE_*` (6 vars) | No | That plan/interval's checkout returns 501 | One Stripe Price ID per plan × interval (Starter/Growth/Scale × monthly/annual). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | No | **Not yet wired to any code** | Reserved for transactional email sending — not implemented yet (see `KNOWN_LIMITATIONS.md`). |
| `NODE_ENV` | Set by the platform | `development` locally, `production` in `next start` builds | Controls cookie `secure` flag and Next.js optimizations. |

## What's deliberately absent

- **No `AUTH_SECRET` / JWT signing key** — sessions are opaque random tokens; only a SHA-256 hash is stored server-side (`src/lib/auth/session.ts`). Nothing needs to verify a signature.
- **No AWS-specific variables** (no `AWS_REGION`, no S3 bucket names) — this app doesn't require AWS-specific services to run. If you deploy on AWS anyway (e.g. RDS for Postgres, S3+CloudFront for static assets), those are standard `DATABASE_URL`/asset-hosting concerns, not app-specific env vars.
