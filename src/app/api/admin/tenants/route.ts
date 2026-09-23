import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";

// Super admin: platform-wide tenant list. Deliberately excludes tenant *content*
// (keywords, audits, CRM data) — only account/billing/usage metadata a platform
// operator needs for support and health monitoring. See KNOWN_LIMITATIONS.md.
export async function GET() {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberships: true, projects: true } },
    },
  });

  const [totalUsers, activeTenants, trialingTenants, suspendedTenants] = await Promise.all([
    prisma.user.count(),
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.tenant.count({ where: { status: "TRIALING" } }),
    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
  ]);

  return NextResponse.json({
    metrics: {
      totalTenants: tenants.length,
      totalUsers,
      activeTenants,
      trialingTenants,
      suspendedTenants,
    },
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      status: t.status,
      memberCount: t._count.memberships,
      projectCount: t._count.projects,
      stripeCustomerId: t.stripeCustomerId,
      currentPeriodEnd: t.currentPeriodEnd,
      cancelAtPeriodEnd: t.cancelAtPeriodEnd,
      createdAt: t.createdAt,
    })),
  });
}
