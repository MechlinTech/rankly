import { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/auth/oauth/handler";
import { microsoftOAuthAdapter } from "@/lib/auth/oauth/microsoft";

/**
 * Backward-compatible alias for deployments whose registered redirect URI uses
 * the pre-/oauth callback path. New configurations should use
 * /api/auth/oauth/microsoft/callback.
 */
export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, microsoftOAuthAdapter);
}
