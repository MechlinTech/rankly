import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { requireRole } from "@/lib/auth/require-role";
import { suspensionCheck } from "@/lib/auth/suspension";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const company = await prisma.company.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      contacts: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!company) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ company });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().max(255).optional(),
  stage: z.enum(["LEAD", "PROSPECT", "CLIENT", "CHURNED"]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  const { id } = await params;
  const existing = await prisma.company.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.stage && parsed.data.stage !== existing.stage) {
    await prisma.crmActivity.create({
      data: {
        tenantId: ctx.tenant.id,
        companyId: id,
        type: "STAGE_CHANGE",
        body: `Stage changed from ${existing.stage} to ${parsed.data.stage}`,
        authorId: ctx.user.id,
      },
    });
  }

  const company = await prisma.company.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ company });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  const { id } = await params;
  const existing = await prisma.company.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
