# API Reference

All routes are Next.js Route Handlers under `src/app/api/`. No public API versioning exists yet (`/api/v1/...`) — introduce it before any external/partner API consumer depends on stability. All routes accept/return JSON. Authenticated routes read the session from the `rankly_session` httpOnly cookie — there is no separate API token/key auth today.

## Auth — `src/app/api/auth/`

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/auth/signup` | POST | public | `{ name, email, password, companyName }`. Creates User + Tenant + OWNER membership. Rate-limited per IP. |
| `/api/auth/login` | POST | public | `{ email, password }`. Rate-limited per IP and per email. |
| `/api/auth/logout` | POST | session | Revokes the current session. |
| `/api/auth/me` | GET | public (returns `user: null` if unauthenticated) | Current user/tenant/role. |
| `/api/auth/oauth/{google,microsoft}/start` | GET | public | Redirects to the provider. Returns 501 if not configured. |
| `/api/auth/oauth/{google,microsoft}/callback` | GET | public | OAuth callback; validates state, creates session. |

## Invitations — `src/app/api/invite/[token]/`

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/invite/[token]` | GET | public | Invite details (email, role, tenant name, whether the email already has an account). |
| `/api/invite/[token]/accept` | POST | public (or session matching the invite email) | Accepts an invite; creates the account if new. |

## Team — `src/app/api/team/`

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/team` | GET | session | Roster + pending invitations for the caller's tenant. |
| `/api/team/invite` | POST | ADMIN+ | `{ email, role }`. Enforces plan entitlement (max team members) — 402 if exceeded. |
| `/api/team/invitations/[id]` | DELETE | ADMIN+ | Revoke a pending invitation. |
| `/api/team/members/[id]` | PATCH | ADMIN+ | `{ role?, isActive? }`. Owner-only for owner-level changes; last-owner protected. |
| `/api/team/members/[id]` | DELETE | ADMIN+ | Remove a member; same owner protections. |

## SEO engine — `src/app/api/seo/`

All three require a session and a non-suspended tenant; results persist to the caller's tenant/project.

| Route | Method | Notes |
|---|---|---|
| `/api/seo/audit` | POST | `{ domain, maxPages? }`. Runs a real crawl. Rate-limited and entitlement-checked (max audits/month) — 402 if exceeded. |
| `/api/seo/keywords` | POST | `{ term, locale? }`. Mock data today (see `KNOWN_LIMITATIONS.md`); persists to `Keyword`. |
| `/api/seo/rankings` | POST | `{ domain, terms[], engine?, device? }`. Mock data today; persists to `RankSnapshot`. |

## Billing — `src/app/api/billing/`

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/billing/checkout` | POST | ADMIN+ | `{ plan, interval }`. Creates a Stripe Checkout session. 501 if Stripe isn't configured. |
| `/api/billing/portal` | POST | ADMIN+ | Creates a Stripe Billing Portal session. |
| `/api/billing/webhook` | POST | Stripe signature | Processes subscription lifecycle events. Idempotent by `stripeEventId`. |

## Super admin — `src/app/api/admin/`

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/admin/tenants` | GET | `isSuperAdmin` | Platform metrics + tenant list. No tenant business data. |
| `/api/admin/tenants/[id]` | GET | `isSuperAdmin` | One tenant's members + account-level audit log. |
| `/api/admin/tenants/[id]` | PATCH | `isSuperAdmin` | `{ status: "ACTIVE" \| "SUSPENDED" }`. Enforced immediately across the dashboard and all SEO routes. |

## Error shape

Most routes return `{ error: string }` or `{ error: <zod flatten() shape> }` on failure, with an appropriate status code (400 validation, 401 unauthenticated, 402 entitlement exceeded, 403 unauthorized/suspended, 404, 429 rate-limited, 501 provider not configured, 500 unexpected). There is no standardized error envelope yet — worth introducing before any external API consumer exists.
