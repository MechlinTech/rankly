import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";

export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isSuperAdmin) {
    return {
      user: null,
      response: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    } as const;
  }
  return { user, response: null } as const;
}
