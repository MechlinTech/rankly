import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { hashPassword, isPasswordStrongEnough } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { generateUniqueTenantSlug } from "@/lib/auth/tenant";
import { isRateLimited, getClientIp } from "@/lib/auth/rate-limit";
import { createAndSendVerificationEmail } from "@/lib/email/verification";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
  companyName: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // 10/hour was too aggressive for a shared-IP network (office/university NAT,
  // a coffee-shop connection) where multiple real people signing up look
  // identical to this limiter - a real integration test run from one machine
  // hit it after just 10 signups. 30/hour still blocks credential-stuffing-
  // style abuse while giving legitimate shared-IP signups realistic headroom.
  if (isRateLimited(`signup:${ip}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, password, companyName } = parsed.data;

  if (!isPasswordStrongEnough(password)) {
    return NextResponse.json(
      { error: { formErrors: ["Password must be at least 10 characters."] } },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Deliberately vague to avoid confirming which emails are registered.
    return NextResponse.json(
      { error: { formErrors: ["Could not create account with these details."] } },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);
  const slug = await generateUniqueTenantSlug(companyName);

  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const createdUser = await tx.user.create({
      data: { name, email, passwordHash },
    });

    const tenant = await tx.tenant.create({
      data: { name: companyName, slug, status: "TRIALING" },
    });

    await tx.membership.create({
      data: { tenantId: tenant.id, userId: createdUser.id, role: "OWNER" },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: createdUser.id,
        action: "tenant.created",
        target: tenant.id,
      },
    });

    return createdUser;
  });

  const res = NextResponse.json({ ok: true });
  await createSession(
    user.id,
    {
      ipAddress: ip,
      userAgent: req.headers.get("user-agent"),
    },
    res,
    req,
  );

  // Non-fatal: signup should succeed even if the email provider hiccups.
  await createAndSendVerificationEmail(user.id, user.email, req.nextUrl.origin).catch(() => {});

  return res;
}
