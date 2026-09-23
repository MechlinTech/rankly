import { NextResponse } from "next/server";
import type { Tenant } from "@/generated/prisma/client";

/** Returns a 403 response if the tenant is suspended, otherwise null. Call before any mutating action. */
export function suspensionCheck(tenant: Tenant): NextResponse | null {
  if (tenant.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "This workspace has been suspended. Contact support for details." },
      { status: 403 }
    );
  }
  return null;
}
