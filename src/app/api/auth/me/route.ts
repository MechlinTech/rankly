import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentTenantContext } from "@/lib/auth/tenant";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
      tenant: null,
      role: user.isSuperAdmin ? "SUPERADMIN" : null,
      isSuperAdmin: user.isSuperAdmin,
    });
  }

  return NextResponse.json({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, isSuperAdmin: ctx.user.isSuperAdmin },
    tenant: { id: ctx.tenant.id, name: ctx.tenant.name, slug: ctx.tenant.slug, plan: ctx.tenant.plan },
    role: ctx.role,
    isSuperAdmin: ctx.user.isSuperAdmin,
  });
}
