import { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/auth/oauth/handler";
import { googleOAuthAdapter } from "@/lib/auth/oauth/google";

export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, googleOAuthAdapter);
}
