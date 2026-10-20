import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { getOverallAiHealth } from "@/lib/ai/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const health = await getOverallAiHealth();
  return NextResponse.json(health);
}
