import { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/auth/oauth/handler";
import { googleOAuthAdapter } from "@/lib/auth/oauth/google";

/**
 * Backward-compatible alias for deployments whose registered redirect URI uses
 * the pre-/oauth callback path. New configurations should use
 * /api/auth/oauth/google/callback.
 */
export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, googleOAuthAdapter);
}
