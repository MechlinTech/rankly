import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import type { TenantStatus } from "@/generated/prisma/client";

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
  status: z.enum(["ACTIVE", "SUSPENDED", "TRIALING", "CANCELED"]),
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

  const existingTenant = await prisma.tenant.findUnique({ where: { id } });
  if (!existingTenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const requestedStatus = parsed.data.status;

  if (requestedStatus === "SUSPENDED") {
    // Preserve original pre-suspension status across repeated suspensions
    let previousStatus: TenantStatus = existingTenant.status;
    if (existingTenant.status === "SUSPENDED") {
      const lastSuspensionLog = await prisma.auditLog.findFirst({
        where: { tenantId: id, action: "tenant.suspended_by_admin" },
        orderBy: { createdAt: "desc" },
      });
      const recorded = (lastSuspensionLog?.metadata as { previousStatus?: TenantStatus } | null)?.previousStatus;
      if (recorded && recorded !== "SUSPENDED") {
        previousStatus = recorded;
      } else {
        previousStatus = "ACTIVE";
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { status: "SUSPENDED" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: id,
        actorId: user.id,
        action: "tenant.suspended_by_admin",
        target: id,
        metadata: { previousStatus },
      },
    });

    return NextResponse.json({ ok: true, tenant });
  }

  // Reactivation flow: when a suspended tenant is reactivated (status !== "SUSPENDED")
  if (existingTenant.status === "SUSPENDED") {
    const lastSuspensionLog = await prisma.auditLog.findFirst({
      where: { tenantId: id, action: "tenant.suspended_by_admin" },
      orderBy: { createdAt: "desc" },
    });

    const previousStatus =
      (lastSuspensionLog?.metadata as { previousStatus?: TenantStatus } | null)?.previousStatus;

    let targetStatus: TenantStatus;

    // Check if tenant was trialing before suspension
    const wasTrialing =
      previousStatus === "TRIALING" ||
      (!previousStatus && !existingTenant.stripeSubscriptionId);

    if (wasTrialing) {
      // Check trial expiration rules
      const isTrialExpired =
        existingTenant.trialEndsAt !== null &&
        existingTenant.trialEndsAt !== undefined &&
        new Date(existingTenant.trialEndsAt) <= new Date();

      if (isTrialExpired) {
        // Trial expired: follow existing expiration/subscription rules
        targetStatus = existingTenant.stripeSubscriptionId ? "ACTIVE" : "CANCELED";
      } else {
        // Trial remains valid: restore TRIALING
        targetStatus = "TRIALING";
      }
    } else if (previousStatus === "ACTIVE") {
      targetStatus = "ACTIVE";
    } else if (previousStatus === "CANCELED") {
      targetStatus = "CANCELED";
    } else {
      targetStatus = requestedStatus;
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { status: targetStatus },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: id,
        actorId: user.id,
        action: "tenant.reactivated_by_admin",
        target: id,
        metadata: { restoredStatus: targetStatus, previousStatus },
      },
    });

    return NextResponse.json({ ok: true, tenant });
  }

  // Non-suspension status update
  const tenant = await prisma.tenant.update({
    where: { id },
    data: { status: requestedStatus },
  });

  return NextResponse.json({ ok: true, tenant });
}
