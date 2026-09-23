import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, createSession } from "@/lib/auth/session";
import { hashPassword, isPasswordStrongEnough } from "@/lib/auth/password";
import { getClientIp } from "@/lib/auth/rate-limit";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await prisma.invitation.findUnique({ where: { token } });

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let userId: string;
  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });

  if (existingUser) {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.email !== invitation.email) {
      return NextResponse.json(
        { error: "An account with this email already exists. Log in with that account, then open this invite link again." },
        { status: 409 }
      );
    }
    userId = existingUser.id;
  } else {
    const { name, password } = parsed.data;
    if (!name || !password) {
      return NextResponse.json({ error: "Name and password are required to create your account." }, { status: 400 });
    }
    if (!isPasswordStrongEnough(password)) {
      return NextResponse.json({ error: "Password must be at least 10 characters." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const createdUser = await prisma.user.create({
      data: { name, email: invitation.email, passwordHash },
    });
    userId = createdUser.id;
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
  });

  await prisma.$transaction([
    existingMembership
      ? prisma.membership.update({
          where: { id: existingMembership.id },
          data: { isActive: true, role: invitation.role },
        })
      : prisma.membership.create({
          data: { tenantId: invitation.tenantId, userId, role: invitation.role },
        }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } }),
    prisma.auditLog.create({
      data: {
        tenantId: invitation.tenantId,
        actorId: userId,
        action: "invitation.accepted",
        target: invitation.id,
      },
    }),
  ]);

  const res = NextResponse.json({ ok: true });
  if (!existingUser) {
    await createSession(
      userId,
      { ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") },
      res,
      req,
    );
  }

  return res;
}
