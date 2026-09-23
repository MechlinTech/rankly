import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { requireRole } from "@/lib/auth/require-role";
import { suspensionCheck } from "@/lib/auth/suspension";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const companyId = req.nextUrl.searchParams.get("companyId");
  const contacts = await prisma.contact.findMany({
    where: { tenantId: ctx.tenant.id, ...(companyId ? { companyId } : {}) },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ contacts });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  title: z.string().trim().max(120).optional(),
  companyId: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: parsed.data.companyId, tenantId: ctx.tenant.id },
    });
    if (!company) return NextResponse.json({ error: "Company not found." }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      tenantId: ctx.tenant.id,
      ownerId: ctx.user.id,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      title: parsed.data.title || null,
      companyId: parsed.data.companyId || null,
      tags: parsed.data.tags ?? [],
    },
  });

  return NextResponse.json({ contact });
}
