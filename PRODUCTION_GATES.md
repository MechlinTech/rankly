# Production Gates

Status as of 2026-09-17. A gate is only checked when independently verifiable, not just "code exists."

## Development ready
- [x] Project scaffolded (Next.js + TypeScript + Tailwind + Prisma)
- [x] Multi-tenant + SEO domain schema defined
- [x] Three real features working end-to-end (site auditor, keyword research UI, rank tracking UI) — verified in-browser
- [x] Email/password auth implemented (signup, login, logout, session revocation) — verified in-browser and against real DB rows
- [x] Team invitations + role-based route enforcement — verified in-browser end to end (invite → accept → RBAC-restricted `/team` UI and API)
- [~] Google/Microsoft OAuth — real protocol code written and the "not configured" path is verified, but the actual provider round-trip is UNTESTED (blocked on real GOOGLE_CLIENT_ID/MICROSOFT_CLIENT_ID credentials, which this environment doesn't have — see KNOWN_LIMITATIONS.md)
- [x] Email verification / forgot password — real Resend integration with graceful fallback when unconfigured; verified end-to-end against real DB rows (signup → token → verify redirect sets `emailVerified`; forgot → reset → old password rejected, new password works, all sessions revoked). The actual Resend send call itself is untested (no API key in this environment) — see KNOWN_LIMITATIONS.md.
- [x] Transactional email sending — team invites now attempt real delivery via Resend, falling back to a manually shared link when unconfigured (unchanged behavior, now on the same adapter as verification/reset emails)
- [x] CRM/workspace UI implemented — companies, contacts, tasks, activity timeline with stages/search/filter, verified end-to-end in-browser including tenant isolation across a second tenant
- [~] Billing — real Stripe integration code (checkout, portal, webhooks with signature verification and idempotency) and real entitlement enforcement (verified: FREE-plan team-member limit blocks a 2nd invite with the correct message). Unconfigured-Stripe path verified (clean 501s). The actual Stripe round-trip is UNTESTED — no Stripe test-mode key in this environment. See KNOWN_LIMITATIONS.md.
- [x] Super-admin portal — verified in-browser end to end: platform metrics + tenant list with no business-data leakage, and tenant suspension is enforced at both the dashboard and API layers (not cosmetic), reactivation restores access.
- [x] Marketing site — one-page site at `/` (hero, features, how it works, security/compliance section, pricing, FAQ, CTA) plus `/pricing`, `/security`, `/privacy`, `/terms`, `/contact`. Legal pages are explicitly labeled draft/placeholder, not reviewed by counsel. Verified in-browser at desktop and mobile widths; nav correctly switches between "Log in/Start free" and "Dashboard" based on session state.
- [~] PWA — manifest, icons, offline page, and service worker file all exist and serve correctly (200s, correct content types, manifest linked in `<head>`). Live service worker registration (install-to-homescreen, offline fallback actually working) is UNVERIFIED — it failed in this session's sandboxed preview browser, most likely due to the automation tool's own iframe/sandbox restrictions rather than a code defect, but this needs confirmation on a real device/browser before trusting it.

## QA ready
- [x] Automated test suite — `npm test` (39 unit tests), `npm run test:integration` (11 tests, real server + real Postgres over HTTP), and `npm run test:e2e` (27 Playwright tests, real Chromium browser + real server + real Postgres, including an axe-core WCAG 2.2 AA accessibility scan) — all passing. `.github/workflows/ci.yml` runs the unit + integration layers (real `postgres:16-alpine` service container + `prisma migrate deploy`) — E2E is not in CI yet. **Neither CI job has actually run in GitHub yet.**
- [x] Fixed a real `npm ci` bug found while wiring this up: `@types/node@^20` conflicted with `vitest@5`'s peer requirement, so a clean install (no local `--legacy-peer-deps` override) would have failed on CI's very first run — bumped to `@types/node@^22` to match the Node 22 this app already targets elsewhere
- [x] Fixed a real dev-mode UI bug found by the E2E suite: Next.js's dev route indicator was intercepting real clicks on the dashboard's Log out button, confirmed via manual coordinate-vs-JS click reproduction in a live browser, not just a Playwright quirk — see KNOWN_LIMITATIONS.md
- [x] Fixed a real WCAG violation found in the same pass: labels weren't programmatically associated with their inputs across 8 forms (`htmlFor`/`id` missing) — fixed everywhere
- [x] Fixed a real, widespread WCAG contrast violation found by the new axe-core spec: bare `text-slate-400` (2.63:1 against white) across 26 files, fixed to `text-slate-500` (~4.77:1) — see KNOWN_LIMITATIONS.md
- [x] Tenant-isolation verified three ways: E2E (real browser), integration tests (a 2nd tenant sees zero of the 1st tenant's CRM/team data), and the original manual API checks
- [x] RBAC verified three ways: E2E and an integration test both create a real MEMBER via invite acceptance and confirm a 403 on an admin route, plus the original manual checks; last-owner protection still only manually verified
- [x] Entitlement enforcement verified in the UI (E2E) and via direct API (integration test) — FREE-plan 402 on a 2nd team member, not just a manual check
- [x] Broken links/images/routes audit run — automated via `tests/e2e/broken-links.spec.ts` across every public and dashboard route, all passing

## Staging ready
- [ ] Deployed to a real staging environment (server or cloud VM)
- [x] Database migrations run against a real Postgres instance (Prisma's `prisma dev` local server — not Docker, not a production-grade Postgres; see KNOWN_LIMITATIONS.md)
- [ ] Real provider credentials configured (or explicitly deferred with a documented plan)
- [~] Production build verified — `npm run build` succeeds with `output: "standalone"`, and the standalone server was run directly against real Postgres with correct results. A `Dockerfile` exists but has NOT been built/run (no Docker in this environment) — do a real `docker build && docker compose up` before trusting the container path.

## Pilot ready
- [ ] At least one real paying-adjacent workflow (signup → project → audit → report) working for an external test user
- [~] Basic monitoring/alerting in place — `GET /api/health` exists and does a real DB check, verified in both up/down states; no uptime checker actually points at it yet, and no error tracking/dashboards exist

## Production ready
- [ ] Load testing performed and reported (not fabricated)
- [ ] Security review completed — baseline security headers added and verified (see SECURITY.md); no CSP, no formal review, no pen test
- [ ] Backup/restore procedure tested
- [~] Compliance posture documented (`COMPLIANCE.md` exists, distinguishing implemented technical controls from actual certifications, which are NOT held) — still needs real legal review, not just documentation

Nothing above is fabricated to look further along than it is — see `KNOWN_LIMITATIONS.md` for detail on every unchecked item.
