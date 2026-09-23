# Compliance

Status as of 2026-09-17. This distinguishes **compliance-ready controls actually implemented** from **certifications**, which this product does not hold. Do not represent this product as certified for any framework below.

## Certifications held

**None.** This is a pre-launch product. No SOC 2, ISO 27001, or similar audit has been performed.

## GDPR / CCPA-CPRA readiness

| Control | Status |
|---|---|
| Data minimization (collect only what's needed for the product to function) | Implemented — schema only stores account/workspace data needed to run the product |
| Right to access own data | Not implemented — no self-service data export tool yet |
| Right to deletion | Not implemented — no self-service account/tenant deletion flow yet |
| Consent management / cookie banner | Not implemented — no non-essential tracking cookies are set today, so none is currently required, but this must be revisited if analytics/marketing cookies are added |
| Data Processing Agreement (DPA) template | Not drafted |
| Subprocessor list | Not published — see `privacy` page placeholder |
| Breach notification procedure | Not documented — see `INCIDENT_RESPONSE.md` (not yet written) |

## OWASP ASVS / NIST CSF-aligned practices actually implemented

- Bcrypt password hashing, revocable server-side sessions, RBAC enforced server-side, tenant isolation enforced server-side, input validation (zod) on all API routes, generic auth error messages, per-tenant rate limiting, OAuth state validation, Stripe webhook signature verification. See `SECURITY.md` (to be added) and the in-product `/security` page for the current list.

## AI governance

The AI-search visibility feature is currently mock data only (no live AI provider integration is enforced yet), so AI governance controls (prompt injection defenses, model usage logging, human override) described in the original product brief are **not yet applicable** — they should be designed before any real LLM-backed feature (e.g. a future content assistant) is built, not retrofitted after.

## What "compliance-ready" does NOT mean here

None of the above should be read as "GDPR compliant" or "SOC 2 ready" in a certifiable sense. It means the underlying technical controls a compliance program would build on already exist. A real compliance program requires legal review, documented policies, a named data protection contact, and (for certifications) an external audit — none of which have happened.
