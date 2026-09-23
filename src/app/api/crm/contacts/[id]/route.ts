import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;

  const { id } = await params;
  const existing = await prisma.contact.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
