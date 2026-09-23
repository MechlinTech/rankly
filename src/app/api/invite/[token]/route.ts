import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { tenant: { select: { name: true } } },
  });

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 404 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    tenantName: invitation.tenant.name,
    requiresLogin: !!existingUser,
  });
}
