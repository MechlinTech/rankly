import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

// Never cache the auth probe: a cached response would let a restored browser
// tab keep rendering the dashboard after the session has ended.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // Remove the stale cookie (expired/revoked session) so the proxy no longer
    // treats this browser as having a session at all.
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json(
      { user: null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json(
      {
        user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
        tenant: null,
        role: user.isSuperAdmin ? "SUPERADMIN" : null,
        isSuperAdmin: user.isSuperAdmin,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, isSuperAdmin: ctx.user.isSuperAdmin },
      tenant: { id: ctx.tenant.id, name: ctx.tenant.name, slug: ctx.tenant.slug, plan: ctx.tenant.plan },
      role: ctx.role,
      isSuperAdmin: ctx.user.isSuperAdmin,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
