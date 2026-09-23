import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isRateLimited, getClientIp } from "@/lib/auth/rate-limit";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

const GENERIC_ERROR = { error: { formErrors: ["Invalid email or password."] } };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Rate limit by IP AND by email to blunt both distributed and single-target brute force.
  if (isRateLimited(`login-ip:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: { formErrors: ["Too many attempts. Try again later."] } }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 400 });
  }

  const { email, password } = parsed.data;

  if (isRateLimited(`login-email:${email}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: { formErrors: ["Too many attempts. Try again later."] } }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

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

  return res;
}
