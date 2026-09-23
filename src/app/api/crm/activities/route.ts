import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { suspensionCheck } from "@/lib/auth/suspension";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  companyId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING"]).optional(),
  body: z.string().trim().min(1).max(5000),
});

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireRole("MEMBER");
  if (!ctx) return response;
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!parsed.data.companyId && !parsed.data.contactId) {
    return NextResponse.json({ error: "An activity must be attached to a company or contact." }, { status: 400 });
  }

  const activity = await prisma.crmActivity.create({
    data: {
      tenantId: ctx.tenant.id,
      companyId: parsed.data.companyId || null,
      contactId: parsed.data.contactId || null,
      type: parsed.data.type ?? "NOTE",
      body: parsed.data.body,
      authorId: ctx.user.id,
    },
  });

  return NextResponse.json({ activity });
}
