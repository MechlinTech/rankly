# Test Plan

## Current state: unit tests exist, everything else is manual

`npm test` runs a real Vitest unit suite — **39 tests, all passing** as of this build — covering pure logic. Nothing beyond that is automated yet: every other verification claim in `KNOWN_LIMITATIONS.md` and `PRODUCTION_GATES.md` was performed manually, in-browser and via direct API/DB checks, during development. This document defines the fuller automated suite that should exist before a QA gate is considered passed for real, and there is no CI wired up yet to run even the unit tests automatically on every change.

## What's actually automated today

Run with `npm test` (`vitest run`, config in `vitest.config.mts`):

| File | Covers |
|---|---|
| `src/lib/seo/audit.test.ts` | `analyzePage()` issue detection — every branch (missing title/meta/H1, thin content, slow response, broken links, 4xx/5xx, network failure short-circuit) |
| `src/lib/auth/tenant.test.ts` | `roleAtLeast()` role ordering (no gaps, correct at every adjacent pair) and `slugify()` edge cases |
| `src/lib/seo/providers/mock.test.ts` | Mock provider determinism (same input → same output, needed since routes rely on this being stable) and shape correctness |
| `src/lib/billing/plans.test.ts` | Plan tier invariants — each paid tier's limits strictly exceed the one below it, Enterprise is unlimited, Free has no Stripe price IDs |

These are true unit tests: no database, no network, no mocking framework needed — they test pure functions directly. `vitest.config.mts` sets a dummy `DATABASE_URL` so importing modules that construct a Prisma client at module scope doesn't throw; none of these tests touch a real database.

## Integration tests: exist, real, passing

`npm run test:integration` runs an actual `next dev` server (via `tests/integration/global-setup.ts`) against a real Postgres and drives it purely over HTTP — no mocking, no importing route handlers directly. **11 tests, all passing** on a freshly-migrated database:

| File | Covers |
|---|---|
| `tests/integration/auth.test.ts` | Health check reachability, signup creating a real usable session, duplicate-email rejection without enumeration, login success/failure, logout revoking the session (a revoked cookie stops working), unauthenticated redirect to `/login`, forgot-password giving an identical response whether or not the email exists |
| `tests/integration/tenant-isolation.test.ts` | A second tenant seeing zero of the first tenant's CRM companies; a second tenant's team roster containing only its own owner; a real invite-acceptance flow producing a MEMBER session that gets a 403 from an admin-only route; a FREE-plan tenant getting a 402 with the specific message when adding a 2nd team member |

This suite already caught two real things worth fixing while it was being built (not disclosed as untested — actually found and fixed): the signup rate limit (10/hour/IP) was tight enough that the test suite itself tripped it, which is also realistic for a shared office/university connection — raised to 30/hour. And an early draft of the RBAC test incorrectly expected an invite to succeed on a FREE-plan tenant that was already at its 1-member limit — the app was correctly returning 402; the test was wrong and was fixed, not the app.

**Known flakiness, disclosed rather than hidden**: this local `prisma dev` ephemeral Postgres instance became unstable ("Server has closed the connection" / `ConnectionClosed`) after this session's very heavy cumulative use (dozens of schema pushes, restarts, and manual + automated test runs against the same long-lived process). A `npx prisma dev rm rankly --force && npx prisma dev --name rankly --detach` followed by re-applying the schema resolved it every time it occurred, and the suite then passed cleanly and repeatably. This is specific to this lightweight dev-only tool, not the application, and not expected against a real Postgres instance (staging/production, or even a Dockerized Postgres for local dev) — but if you see intermittent connection errors running these locally, that's the likely cause.

## CI: exists, has two jobs, unproven

`.github/workflows/ci.yml` runs on every push/PR to `main`/`master`, as two parallel jobs:

- **`checks`**: `npx tsc --noEmit`, `npx eslint src`, `npm test` (unit), `npm run build`. Uses a placeholder `DATABASE_URL` for the build step — confirmed locally that `npm run build` succeeds with an unreachable database URL, since no route queries Postgres at build time.
- **`integration`**: spins up a real `postgres:16-alpine` service container, runs `npx prisma migrate deploy` against it (the actual production migration command, not `db push`), then `npm run test:integration`. Confirmed locally that `prisma migrate deploy` applies all 4 migrations cleanly to a genuinely empty database and the integration suite then passes 11/11 against it — this exercises the exact same commands CI runs, just against this session's local Postgres instead of GitHub's container.

**Neither job has actually run in GitHub Actions yet** — both ship in the same commit as this note, before any push has triggered them. `npm ci` itself was also broken until this same change: `@types/node@^20` conflicted with `vitest@5`'s peer requirement (`^22 || >=24`), so a clean `npm ci` (no local `--legacy-peer-deps` override) failed with `ERESOLVE` — confirmed by reproducing it, then fixed by bumping to `@types/node@^22` to match the Node 22 this app already targets everywhere else (Dockerfile, CI `node-version`). This would have broken CI on its very first run had it not been caught here. Treat all of the above as unverified until you see both jobs go green in GitHub's Actions tab.

## E2E tests: exist, real, passing — and found two real bugs

`npm run test:e2e` runs Playwright against a real Chromium browser, a real `next dev` server, and real Postgres — full user-facing flows, not API shortcuts. **27 tests, all passing** as of this build:

| File | Covers |
|---|---|
| `tests/e2e/auth-flow.spec.ts` | Signup landing on the dashboard with the correct tenant/email shown; logout redirecting and actually revoking dashboard access; the unverified-email banner and its resend button; wrong-password rejection; duplicate-email signup rejection; unauthenticated redirect; marketing nav switching between "Start free" and "Dashboard" based on session |
| `tests/e2e/seo-tools.spec.ts` | Keyword research, rank tracking, and site audit all working through the real UI (not just the API); CRM company creation → note → stage change, with the stage-change activity appearing in the timeline; the FREE-plan entitlement error rendering correctly in `/team`'s UI |
| `tests/e2e/broken-links.spec.ts` | Every public marketing route and every dashboard route returns 2xx, has no broken `<img>` tags, has no internal links pointing to a broken page, and (on the public pages) produces no real console errors |
| `tests/e2e/accessibility.spec.ts` | axe-core WCAG 2.2 AA scan (serious/critical violations only) across 5 public routes and 4 dashboard routes |

**This suite found two genuine bugs, not test artifacts.**

**Bug 1 — a real click-interception bug**: Next.js's dev-mode route indicator defaults to the bottom-left of the screen — exactly where this app's dashboard sidebar puts the "Log out" button. It was physically intercepting real mouse clicks at that screen position. This was **confirmed with a real coordinate-based click in a live browser** (not just Playwright): a click at the button's on-screen position did nothing, while a JavaScript-dispatched click on the same DOM element worked correctly — proving the browser's own hit-testing was routing the click to the overlay, not the button. Fixed by setting `devIndicators: false` in `next.config.ts` (compile/runtime errors still surface without it, per Next's docs). This is dev-mode-only UI, so it's not a *production* bug in the sense of affecting `next start`/deployed builds, but it would have degraded the real development/QA experience for anyone testing this app locally, and masked itself as "flaky tests" if left undiagnosed. After the fix, the same suite went from ~3 minutes with several failures to a stable pass in under a minute.

**Bug 2 — a real, widespread WCAG contrast violation**: adding the axe-core accessibility spec immediately found `text-slate-400` (#90a1b9) on white backgrounds computing to a 2.63:1 contrast ratio, well under the 4.5:1 WCAG AA minimum for normal text — flagged on every route checked. This wasn't a one-off: `text-slate-400` used without a `dark:` prefix (meaning it applied in light mode too) turned out to be a genuinely widespread pattern across **26 files** — table column headers, footer links, the "or" divider on login/signup, password hints, empty-state messages, timestamps, and more. Every bare occurrence was audited and changed to `text-slate-500` (#64748b, which computes to ~4.77:1 against white — verified by hand via the WCAG relative-luminance formula before applying it everywhere), leaving the already-correct `dark:text-slate-400` variants untouched (dark backgrounds have plenty of contrast against slate-400). All 6 accessibility tests pass after the fix.

**Same `prisma dev` flakiness as the integration suite, same remedy**: this local ephemeral Postgres instance needed recreating multiple times during E2E development too, for the same reason (heavy cumulative session use) — see below. A `waitForResponse()` pattern was added to the SEO-tool tests so they wait for the actual API response rather than a fixed UI-assertion timeout, which is good practice regardless of the underlying DB tool's stability.

## Known flakiness in this local dev environment, disclosed rather than hidden

This local `prisma dev` ephemeral Postgres instance became unstable ("Server has closed the connection" / `ConnectionClosed` / `ECONNRESET`) multiple times across this session's very heavy cumulative use (dozens of schema pushes, restarts, and manual + automated test runs — unit, integration, and now E2E — against the same long-lived process). A `npx prisma dev rm rankly --force && npx prisma dev --name rankly --detach` followed by re-applying migrations resolved it every single time it occurred, and each suite then passed cleanly and repeatably against the fresh instance. This is specific to this lightweight dev-only tool under unusually heavy single-session load, not the application, and not expected against a real Postgres instance (staging/production, a Dockerized Postgres for local dev, or CI's `postgres:16-alpine` service container) — but if you see intermittent connection errors running these suites locally, recreating the dev database is the fix, not a code change.

## Planned but not yet built

| Layer | Tool (suggested) | Scope |
|---|---|---|
| Accessibility | axe-core (via Playwright) | WCAG 2.2 AA basics on marketing site and dashboard pages — not yet automated, though the label-association bugs axe would likely have caught were found and fixed manually this session (see KNOWN_LIMITATIONS.md) |
| Security-focused | Manual + `npm audit` / a SAST tool in CI | See `SECURITY.md` for what's checked today |
| Super-admin suspension | Integration/E2E test (needs a super-admin test fixture) | The manual verification in `KNOWN_LIMITATIONS.md` (suspend blocks dashboard + API, reactivate restores) isn't automated yet — needs an `isSuperAdmin` session, which has no automatable self-service path by design |
| E2E in CI | GitHub Actions job with a Postgres service container + Playwright's Chromium | Not wired up yet — `test:e2e` currently only runs locally |

## What's now automated vs. still manual-only

**Automated** (unit + integration + E2E, see above): the full signup/login/logout/session lifecycle, duplicate-email and wrong-password rejection, forgot-password non-enumeration, tenant isolation (CRM + team roster), RBAC via a real invite-acceptance flow, the FREE-plan 402 entitlement block, all three SEO tools working end-to-end through the real UI, CRM create/note/stage-change, and a broken-link/broken-image sweep across every route.

**Still manual-only** (see `KNOWN_LIMITATIONS.md` for full detail):
- Super-admin flows: metrics/tenant list without business-data leakage; suspension enforced at both the dashboard UI and API layers, reactivation restores access
- OAuth/Stripe unconfigured paths returning clean 501s
- PWA assets serving correctly
- Production build: `npm run build` succeeds; standalone server boots and serves real DB-backed responses

## What has NOT been tested

- No load testing has been performed (see `KNOWN_LIMITATIONS.md` — do not assume any particular request volume is safe until this is run)
- No penetration testing
- No cross-browser/cross-device E2E coverage beyond Chromium at desktop width (Playwright supports Firefox/WebKit and mobile viewports — not yet added to `playwright.config.ts`)
- OAuth and Stripe real provider round-trips (blocked on credentials not available in this environment)
- Live PWA install/offline behavior on a real device (see `KNOWN_LIMITATIONS.md`)

## Before calling any future build "QA ready"

1. Push this branch and confirm both CI jobs actually go green in GitHub's Actions tab (neither has run yet — see above).
2. Add an E2E job to CI (Postgres service container + Playwright browsers).
3. Add axe-core accessibility checks to the E2E suite.
4. Get real OAuth and Stripe test-mode credentials and run the full round-trip at least once.
