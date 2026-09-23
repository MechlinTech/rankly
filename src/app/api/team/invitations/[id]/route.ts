import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  const { id } = await params;
  const invitation = await prisma.invitation.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }

  await prisma.invitation.update({ where: { id }, data: { status: "REVOKED" } });
  await prisma.auditLog.create({
    data: { tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "invitation.revoked", target: id },
  });

  return NextResponse.json({ ok: true });
}
