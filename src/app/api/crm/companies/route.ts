import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { requireRole } from "@/lib/auth/require-role";
import { suspensionCheck } from "@/lib/auth/suspension";
import { prisma } from "@/lib/db";

const STAGES = ["LEAD", "PROSPECT", "CLIENT", "CHURNED"] as const;

export async function GET(req: NextRequest) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("q")?.trim();
  const stage = searchParams.get("stage");
  const tag = searchParams.get("tag")?.trim();

  const companies = await prisma.company.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(stage && STAGES.includes(stage as (typeof STAGES)[number]) ? { stage: stage as (typeof STAGES)[number] } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    include: { _count: { select: { contacts: true, tasks: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ companies });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional(),
  stage: z.enum(STAGES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const company = await prisma.company.create({
    data: {
      tenantId: ctx.tenant.id,
      ownerId: ctx.user.id,
      name: parsed.data.name,
      domain: parsed.data.domain || null,
      stage: parsed.data.stage ?? "LEAD",
      tags: parsed.data.tags ?? [],
      notes: parsed.data.notes || null,
    },
  });

  return NextResponse.json({ company });
}
