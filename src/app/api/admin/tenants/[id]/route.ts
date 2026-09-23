import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: { select: { id: true, email: true, name: true, createdAt: true } } } },
      _count: { select: { projects: true } },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const recentEvents = await prisma.auditLog.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenant.status,
    createdAt: tenant.createdAt,
    stripeCustomerId: tenant.stripeCustomerId,
    currentPeriodEnd: tenant.currentPeriodEnd,
    projectCount: tenant._count.projects,
    members: tenant.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      isActive: m.isActive,
      user: m.user,
    })),
    recentEvents,
  });
}

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({ where: { id }, data: { status: parsed.data.status } });

  await prisma.auditLog.create({
    data: {
      tenantId: id,
      actorId: user.id,
      action: parsed.data.status === "SUSPENDED" ? "tenant.suspended_by_admin" : "tenant.reactivated_by_admin",
      target: id,
    },
  });

  return NextResponse.json({ ok: true, tenant });
}
