import { NextRequest } from "next/server";
import { handleOAuthStart } from "@/lib/auth/oauth/handler";
import { microsoftOAuthAdapter } from "@/lib/auth/oauth/microsoft";

export async function GET(req: NextRequest) {
  return handleOAuthStart(req, microsoftOAuthAdapter);
}
