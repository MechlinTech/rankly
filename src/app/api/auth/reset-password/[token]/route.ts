import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValidResetToken, consumePasswordReset } from "@/lib/email/password-reset";
import { isPasswordStrongEnough } from "@/lib/auth/password";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await getValidResetToken(token);
  return NextResponse.json({ valid: !!record });
}

const requestSchema = z.object({
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!isPasswordStrongEnough(parsed.data.password)) {
    return NextResponse.json({ error: "Password must be at least 10 characters." }, { status: 400 });
  }

  const ok = await consumePasswordReset(token, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
