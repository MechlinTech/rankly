import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "./tenant";
import { roleAtLeast } from "./tenant";
import { suspensionCheck } from "./suspension";
import type { Role } from "@/generated/prisma/client";

export async function requireRole(minimum: Role) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { ctx: null, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) } as const;
  }
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) {
    return { ctx: null, response: suspended } as const;
  }
  if (!roleAtLeast(ctx.role, minimum)) {
    return { ctx: null, response: NextResponse.json({ error: "Insufficient permissions." }, { status: 403 }) } as const;
  }
  return { ctx, response: null } as const;
}
