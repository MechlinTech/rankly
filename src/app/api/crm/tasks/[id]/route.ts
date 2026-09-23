import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;

  const { id } = await params;
  const existing = await prisma.crmTask.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await prisma.crmTask.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;

  const { id } = await params;
  const existing = await prisma.crmTask.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.crmTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
