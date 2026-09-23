import { NextRequest } from "next/server";
import { handleOAuthStart } from "@/lib/auth/oauth/handler";
import { googleOAuthAdapter } from "@/lib/auth/oauth/google";

export async function GET(req: NextRequest) {
  return handleOAuthStart(req, googleOAuthAdapter);
}
