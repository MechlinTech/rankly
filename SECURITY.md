# Security

This document is the engineering-facing companion to the in-product `/security` page — more detail, same honesty standard: what's actually implemented and verified vs. what's still open.

## Reporting a vulnerability

There is no dedicated security contact set up yet (pre-launch product). Until one exists, route reports through the `/contact` page placeholder.

## Implemented controls

| Control | Implementation |
|---|---|
| Password hashing | bcrypt, cost factor 12 (`src/lib/auth/password.ts`) |
| Session management | Opaque 32-byte random token; only its SHA-256 hash is stored (`src/lib/auth/session.ts`); httpOnly, `secure` in production, `sameSite=lax` cookie; 30-day expiry; explicit revocation on logout |
| RBAC | Server-side role checks on every mutating route (`requireRole()`), never UI-only |
| Tenant isolation | Every query scoped by a `tenantId` derived from the session, never from client input (see `ARCHITECTURE.md` for the current app-layer-only caveat) |
| Input validation | `zod` schemas on every API route body |
| Auth enumeration resistance | Generic error messages on login/signup |
| Rate limiting | Per-tenant/per-IP/per-email, in-memory (`src/lib/auth/rate-limit.ts`) — see Known Gaps |
| OAuth CSRF protection | Random `state` stored in a short-lived httpOnly cookie, validated byte-for-byte on callback (`src/lib/auth/oauth/handler.ts`) |
| Webhook authenticity | Stripe signature verification via `stripe.webhooks.constructEvent` (`src/lib/billing/stripe.ts`), plus idempotency by event ID |
| Tenant suspension | Enforced at both the dashboard layout and every SEO/team API route (`suspensionCheck()`), not cosmetic — verified in `KNOWN_LIMITATIONS.md` |
| Least privilege | No self-service path to super admin; owner-only controls for owner-level membership changes; last-owner protection prevents a tenant being left without an owner |
| Audit logging | `AuditLog` table records account/security events (tenant creation, invitations, membership changes, admin suspensions) |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy` — set on every route in `next.config.ts`, verified via `curl -i` |
| Health check | `GET /api/health` runs a real DB query and returns 503 (not 200) when Postgres is unreachable — verified in both states |

## Known gaps (do not deploy publicly without addressing)

- **No CSRF token** beyond `sameSite=lax` + same-origin fetches. Fine today (no cross-site form posts, no third-party embeds); revisit before adding any cross-origin integration.
- **Rate limiting is in-memory and per-process** — ineffective across multiple app instances/load balancers. Replace with Redis (or similar) before horizontal scaling.
- **No Content-Security-Policy yet.** The baseline headers above are set, but a real CSP needs to enumerate every third-party script/style/frame the app actually loads (Stripe Checkout, Google/Microsoft OAuth redirects) and hasn't been tuned — a naive CSP could break those flows, so it wasn't added speculatively.
- **No MFA.**
- **No automated dependency/secret/container scanning** configured in CI. A CI workflow now exists (`.github/workflows/ci.yml`) but only runs type-check/lint/test/build — no `npm audit`, SAST, or secret scanning step yet.
- **Prisma's transitive dependencies** (`mysql2`, `deepmerge-ts`) carry unpatched high-severity advisories as of 2026-09-17 — not currently exploitable here (Postgres-only, no untrusted recursive config merging) but re-check `npm audit` before each production deploy.
- **No penetration test has been performed.** Do not claim otherwise.

## Secrets management

Local development uses a `.env` file (gitignored). Production should use your platform's secret manager (see `DEPLOYMENT_INSTRUCTIONS.md`) — never commit real secrets, and rotate `STRIPE_SECRET_KEY`/OAuth client secrets/`DATABASE_URL` credentials if they are ever exposed.

## Encryption

- **In transit**: enforced by TLS termination at your reverse proxy/load balancer (see `DEPLOYMENT_INSTRUCTIONS.md`) — the app itself doesn't terminate TLS.
- **At rest**: depends entirely on your Postgres hosting choice (e.g. a managed provider's disk encryption). Not something this application layer controls.
