import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAndSendPasswordResetEmail } from "@/lib/email/password-reset";
import { isRateLimited, getClientIp } from "@/lib/auth/rate-limit";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

// Always responds the same way regardless of whether the email exists, to avoid
// user enumeration — the actual email (if any) is sent asynchronously to that effect.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`forgot-password:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && user.passwordHash) {
    await createAndSendPasswordResetEmail(user.id, user.email, req.nextUrl.origin);
  }

  return NextResponse.json({ ok: true });
}
