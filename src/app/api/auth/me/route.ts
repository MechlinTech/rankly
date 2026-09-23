import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/tenant";

export async function GET() {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
    tenant: { id: ctx.tenant.id, name: ctx.tenant.name, slug: ctx.tenant.slug, plan: ctx.tenant.plan },
    role: ctx.role,
  });
}
