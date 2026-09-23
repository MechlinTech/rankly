# Incident Response

This is a planning document for a pre-launch product — it has not been exercised against a real incident. Review and adapt before relying on it operationally.

## Severity levels (proposed)

- **SEV1** — full outage, data breach, or data loss affecting any tenant
- **SEV2** — degraded service for some tenants, a security vulnerability under active exploitation
- **SEV3** — degraded service for a single tenant, non-critical bug

## Immediate steps for a suspected security incident

1. **Contain**: if a specific tenant's account is compromised, use `/admin/tenants/[id]` to suspend it immediately (`SECURITY.md`/`KNOWN_LIMITATIONS.md` confirm this is enforced, not cosmetic).
2. **Revoke sessions**: for a compromised user, the fastest path today is a direct database update to `Session.revokedAt` for that user (no in-app "revoke all sessions" button exists yet — a gap worth closing before launch).
3. **Rotate secrets**: if `STRIPE_SECRET_KEY`, OAuth client secrets, or `DATABASE_URL` credentials are suspected exposed, rotate them immediately in their respective provider dashboards and redeploy.
4. **Assess scope**: check `AuditLog` and `BillingEvent` for the affected tenant(s) to reconstruct what happened.
5. **Notify**: for a confirmed breach involving personal data, GDPR/CCPA breach-notification timelines may apply (see `COMPLIANCE.md`) — this requires real legal input, not just engineering judgment.

## Breach notification

**Not yet designed.** No templated customer/regulator notification process exists. This must be built with legal counsel before launch, per `COMPLIANCE.md`.

## Post-incident

- Write a blameless postmortem: timeline, root cause, what was learned, concrete follow-up actions.
- Add a regression test if the incident was caused by a bug (once the automated test suite in `TEST_PLAN.md` exists).

## Known gaps in incident-response readiness

- No on-call rotation (see `OPERATIONS.md`)
- No "revoke all sessions for a user" admin action yet
- No automated alerting for suspicious activity (e.g. repeated failed logins beyond the existing rate limit, unusual admin actions)
- No breach-notification templates or legal review
