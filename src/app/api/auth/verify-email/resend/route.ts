import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createAndSendVerificationEmail } from "@/lib/email/verification";
import { isRateLimited } from "@/lib/auth/rate-limit";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (user.emailVerified) return NextResponse.json({ error: "Email already verified." }, { status: 400 });

  if (isRateLimited(`verify-resend:${user.id}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const result = await createAndSendVerificationEmail(user.id, user.email, req.nextUrl.origin);
  return NextResponse.json({ ok: true, emailSent: result.sent, ...(result.sent ? {} : { verifyUrl: result.verifyUrl }) });
}
