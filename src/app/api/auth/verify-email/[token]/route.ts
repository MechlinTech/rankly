import { NextRequest, NextResponse } from "next/server";
import { consumeVerificationToken } from "@/lib/email/verification";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await consumeVerificationToken(token);

  const destination = result.ok ? "/keywords?verified=1" : "/keywords?verified=0";
  return NextResponse.redirect(new URL(destination, req.nextUrl.origin));
}
