import { prisma } from "@/lib/db";
import { getPlan } from "./plans";
import type { Tenant } from "@/generated/prisma/client";

export class EntitlementError extends Error {}

/** Throws if inviting one more active member would exceed the tenant's plan limit. */
export async function assertCanAddTeamMember(tenant: Tenant): Promise<void> {
  const plan = getPlan(tenant.plan);
  const activeCount = await prisma.membership.count({ where: { tenantId: tenant.id, isActive: true } });
  const pendingInvites = await prisma.invitation.count({ where: { tenantId: tenant.id, status: "PENDING" } });

  if (activeCount + pendingInvites >= plan.maxTeamMembers) {
    throw new EntitlementError(
      `Your ${plan.name} plan allows up to ${plan.maxTeamMembers} team member(s). Upgrade to invite more.`
    );
  }
}

/** Throws if creating one more project would exceed the tenant's plan limit. */
export async function assertCanAddProject(tenant: Tenant): Promise<void> {
  const plan = getPlan(tenant.plan);
  const count = await prisma.project.count({ where: { tenantId: tenant.id } });
  if (count >= plan.maxProjects) {
    throw new EntitlementError(
      `Your ${plan.name} plan allows up to ${plan.maxProjects} project(s). Upgrade to add more.`
    );
  }
}

/** Throws if running one more audit this month would exceed the tenant's plan limit. */
export async function assertCanRunAudit(tenant: Tenant): Promise<void> {
  const plan = getPlan(tenant.plan);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const count = await prisma.siteAuditRun.count({
    where: { project: { tenantId: tenant.id }, createdAt: { gte: startOfMonth } },
  });
  if (count >= plan.maxAuditsPerMonth) {
    throw new EntitlementError(
      `Your ${plan.name} plan allows up to ${plan.maxAuditsPerMonth} audit(s) per month. Upgrade to run more.`
    );
  }
}
