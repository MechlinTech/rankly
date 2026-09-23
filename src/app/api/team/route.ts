import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { prisma } from "@/lib/db";

// Any active member can view the team roster; management actions require ADMIN+ (enforced per-route).
export async function GET() {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { tenantId: ctx.tenant.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    currentRole: ctx.role,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      isActive: m.isActive,
      user: m.user,
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      status: i.status,
    })),
  });
}
