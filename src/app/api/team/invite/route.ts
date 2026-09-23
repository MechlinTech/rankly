import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createInvitation } from "@/lib/team/invitations";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { assertCanAddTeamMember, EntitlementError } from "@/lib/billing/entitlements";
import { sendEmail } from "@/lib/email/resend";
import { teamInviteTemplate } from "@/lib/email/templates";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER", "VIEWER"]),
});

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  if (isRateLimited(`invite:${ctx.tenant.id}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many invitations sent. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, role } = parsed.data;

  const existingMember = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenant.id, user: { email } },
  });
  if (existingMember) {
    return NextResponse.json({ error: "This person is already a member of your team." }, { status: 400 });
  }

  try {
    await assertCanAddTeamMember(ctx.tenant);
  } catch (err) {
    if (err instanceof EntitlementError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    throw err;
  }

  const invitation = await createInvitation(ctx.tenant.id, ctx.user.id, email, role);

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "invitation.created",
      target: invitation.id,
      metadata: { email, role },
    },
  });

  const inviteUrl = `${req.nextUrl.origin}/invite/${invitation.token}`;
  const { subject, html } = teamInviteTemplate(inviteUrl, ctx.tenant.name, ctx.user.email);
  const emailResult = await sendEmail({ to: email, subject, html }).catch(() => ({ sent: false as const }));

  // If no email provider is configured (or sending failed), the invite link is
  // returned directly so it can still be shared manually — see KNOWN_LIMITATIONS.md.
  return NextResponse.json({
    ok: true,
    emailSent: emailResult.sent,
    ...(emailResult.sent ? {} : { inviteUrl }),
    expiresAt: invitation.expiresAt,
  });
}
