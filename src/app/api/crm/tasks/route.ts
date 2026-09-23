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
  const status = req.nextUrl.searchParams.get("status");

  const tasks = await prisma.crmTask.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(companyId ? { companyId } : {}),
      ...(status ? { status: status as "OPEN" | "IN_PROGRESS" | "DONE" } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });

  return NextResponse.json({ tasks });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  companyId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  dueAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await prisma.crmTask.create({
    data: {
      tenantId: ctx.tenant.id,
      title: parsed.data.title,
      companyId: parsed.data.companyId || null,
      contactId: parsed.data.contactId || null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      assigneeId: ctx.user.id,
    },
  });

  return NextResponse.json({ task });
}
