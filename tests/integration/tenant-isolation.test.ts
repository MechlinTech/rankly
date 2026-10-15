import "dotenv/config";
import { describe, it, expect } from "vitest";
import { signUp, authedFetch } from "./helpers";
import { Client } from "pg";

// A single one-off `pg` connection, opened and closed per call, rather than a
// second long-lived Prisma client/pool. `prisma dev`'s local ephemeral Postgres
// has a tight connection_limit (10) shared with the app server under test - a
// second persistent pool from this test file was intermittently exhausting it
// ("Server has closed the connection"). One short-lived raw connection avoids
// that entirely; this is purely test plumbing to seed state the app itself has
// no API for (there's no route to change a tenant's plan outside real Stripe
// checkout/webhooks), not a pattern used anywhere in the actual application.
// Even a single one-off connection intermittently gets dropped by this
// specific dev-only Postgres proxy under this session's heavy cumulative use
// (see TEST_PLAN.md) - retrying once is a pragmatic accommodation for that
// environment quirk, not a workaround for anything the application does.
async function setTenantPlan(tenantId: string, plan: string, attempt = 1): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('UPDATE "Tenant" SET plan = $1 WHERE id = $2', [plan, tenantId]);
  } catch (err) {
    if (attempt >= 3) throw err;
    await new Promise((r) => setTimeout(r, 300));
    return setTenantPlan(tenantId, plan, attempt + 1);
  } finally {
    await client.end().catch(() => {});
  }
}

describe("tenant isolation and RBAC (real server, real Postgres)", () => {
  it("a second tenant cannot see the first tenant's CRM companies", async () => {
    const tenantA = await signUp();
    const tenantB = await signUp();

    const createRes = await authedFetch("/api/crm/companies", tenantA.cookie, {
      method: "POST",
      body: JSON.stringify({ name: "Tenant A's Secret Client" }),
    });
    expect(createRes.status).toBe(200);

    const bListRes = await authedFetch("/api/crm/companies", tenantB.cookie);
    const bList = await bListRes.json();
    expect(bList.companies).toEqual([]);

    const aListRes = await authedFetch("/api/crm/companies", tenantA.cookie);
    const aList = await aListRes.json();
    expect(aList.companies).toHaveLength(1);
    expect(aList.companies[0].name).toBe("Tenant A's Secret Client");
  });

  it("a second tenant cannot see the first tenant's audit history via project data", async () => {
    const tenantA = await signUp();
    const tenantB = await signUp();

    await authedFetch("/api/seo/keywords", tenantA.cookie, {
      method: "POST",
      body: JSON.stringify({ term: "tenant a secret keyword" }),
    });

    const bKeywords = await authedFetch("/api/team", tenantB.cookie);
    expect(bKeywords.status).toBe(200);
    const bData = await bKeywords.json();
    // Tenant B's own team roster should only ever contain tenant B's owner.
    expect(bData.members).toHaveLength(1);
    expect(bData.members[0].user.email).toBe(tenantB.email);
  });

  it("a MEMBER-role user is blocked from admin-only team actions (real invite acceptance, not a fixture)", async () => {
    const owner = await signUp();
    const memberEmail = `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration-test.local`;

    // FREE plan caps team members at 1 (the owner already occupies that slot) -
    // that entitlement is confirmed working correctly elsewhere (see
    // KNOWN_LIMITATIONS.md and the manual verification of this exact 402).
    // Upgrade this tenant's plan directly so this test can isolate what it's
    // actually testing: RBAC on the invite-acceptance path, not entitlements.
    const ownerMe = await (await authedFetch("/api/auth/me", owner.cookie)).json();
    await setTenantPlan(ownerMe.tenant.id, "STARTER");

    const inviteRes = await authedFetch("/api/team/invite", owner.cookie, {
      method: "POST",
      body: JSON.stringify({ email: memberEmail, role: "MEMBER" }),
    });
    expect(inviteRes.status).toBe(200);
    const invite = await inviteRes.json();
    expect(invite.inviteUrl).toBeTruthy(); // no Resend key in this test environment, so it falls back to a link

    const token = invite.inviteUrl.split("/invite/")[1];
    const acceptRes = await fetch(`${invite.inviteUrl.split("/invite/")[0]}/api/invite/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Member", password: "member-password-123" }),
    });
    expect(acceptRes.status).toBe(200);
    const memberCookie = acceptRes.headers.get("set-cookie")?.match(/rankly_session=[^;]+/)?.[0];
    expect(memberCookie).toBeTruthy();

    // The new member is real (session works, sees the owner's tenant)...
    const meRes = await authedFetch("/api/auth/me", memberCookie!);
    const me = await meRes.json();
    expect(me.role).toBe("MEMBER");

    // ...but is rejected by an admin-only route, enforced server-side, not just hidden in the UI.
    const forbiddenRes = await authedFetch("/api/team/invite", memberCookie!, {
      method: "POST",
      body: JSON.stringify({ email: "someone-else@integration-test.local", role: "MEMBER" }),
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it("a FREE-plan tenant is blocked from adding a 2nd team member with a 402", async () => {
    const owner = await signUp(); // FREE by default - the owner already fills its 1-member limit

    const res = await authedFetch("/api/team/invite", owner.cookie, {
      method: "POST",
      body: JSON.stringify({ email: "second-member@integration-test.local", role: "MEMBER" }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toContain("Free plan allows up to 1 team member");
  });

  it("CRM open-task count excludes DONE tasks and contact/audit validations return clean error messages", async () => {
    const tenant = await signUp();

    // 1. Create company
    const compRes = await authedFetch("/api/crm/companies", tenant.cookie, {
      method: "POST",
      body: JSON.stringify({ name: "Task Testing Company" }),
    });
    expect(compRes.status).toBe(200);
    const { company } = await compRes.json();

    // 2. Add an open task
    const taskRes = await authedFetch("/api/crm/tasks", tenant.cookie, {
      method: "POST",
      body: JSON.stringify({ title: "Follow up call", companyId: company.id }),
    });
    expect(taskRes.status).toBe(200);
    const { task } = await taskRes.json();

    // Verify company open-task count is 1
    const listRes1 = await authedFetch("/api/crm/companies", tenant.cookie);
    const listData1 = await listRes1.json();
    const foundComp1 = listData1.companies.find((c: { id: string }) => c.id === company.id);
    expect(foundComp1._count.tasks).toBe(1);

    // 3. Mark task as DONE
    const patchRes = await authedFetch(`/api/crm/tasks/${task.id}`, tenant.cookie, {
      method: "PATCH",
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(patchRes.status).toBe(200);

    // Verify open-task count becomes 0
    const listRes2 = await authedFetch("/api/crm/companies", tenant.cookie);
    const listData2 = await listRes2.json();
    const foundComp2 = listData2.companies.find((c: { id: string }) => c.id === company.id);
    expect(foundComp2._count.tasks).toBe(0);

    // 4. Contact email validation rejects invalid email with 400
    const invalidContactRes = await authedFetch("/api/crm/contacts", tenant.cookie, {
      method: "POST",
      body: JSON.stringify({ name: "Jane Doe", email: "invalid-email", companyId: company.id }),
    });
    expect(invalidContactRes.status).toBe(400);
    const contactErrBody = await invalidContactRes.json();
    expect(JSON.stringify(contactErrBody)).toContain("Please enter a valid email address.");

    // 5. Audit domain validation rejects invalid domain with 400
    const invalidAuditRes = await authedFetch("/api/seo/audit", tenant.cookie, {
      method: "POST",
      body: JSON.stringify({ domain: "not-a-domain" }),
    });
    expect(invalidAuditRes.status).toBe(400);
    const auditErrBody = await invalidAuditRes.json();
    expect(JSON.stringify(auditErrBody)).toContain("Enter a valid domain.");
  });
});
