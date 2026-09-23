import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Unauthenticated by design (load balancers/orchestrators need to hit it without
// credentials) - deliberately returns no information beyond up/down status.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
