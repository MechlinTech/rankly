import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
});

async function countActiveOwners(tenantId: string): Promise<number> {
  return prisma.membership.count({ where: { tenantId, role: "OWNER", isActive: true } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  const { id } = await params;
  const target = await prisma.membership.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Only an OWNER can promote to/demote from OWNER, or modify another OWNER's membership at all.
  if ((target.role === "OWNER" || parsed.data.role === "OWNER") && ctx.role !== "OWNER") {
    return NextResponse.json({ error: "Only an owner can manage owner-level access." }, { status: 403 });
  }

  const wouldRemoveLastOwner =
    target.role === "OWNER" &&
    ((parsed.data.role && parsed.data.role !== "OWNER") || parsed.data.isActive === false);

  if (wouldRemoveLastOwner && (await countActiveOwners(ctx.tenant.id)) <= 1) {
    return NextResponse.json({ error: "A tenant must always have at least one active owner." }, { status: 400 });
  }

  const updated = await prisma.membership.update({
    where: { id },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "membership.updated",
      target: id,
      metadata: parsed.data,
    },
  });

  return NextResponse.json({ ok: true, membership: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  const { id } = await params;
  const target = await prisma.membership.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (target.role === "OWNER" && ctx.role !== "OWNER") {
    return NextResponse.json({ error: "Only an owner can remove another owner." }, { status: 403 });
  }
  if (target.role === "OWNER" && (await countActiveOwners(ctx.tenant.id)) <= 1) {
    return NextResponse.json({ error: "A tenant must always have at least one active owner." }, { status: 400 });
  }

  await prisma.membership.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "membership.removed", target: id },
  });

  return NextResponse.json({ ok: true });
}
