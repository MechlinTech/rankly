import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export async function createInvitation(tenantId: string, invitedBy: string, email: string, role: Role) {
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Revoke any prior pending invitation for the same email so only one is ever active.
  await prisma.invitation.updateMany({
    where: { tenantId, email, status: "PENDING" },
    data: { status: "REVOKED" },
  });

  return prisma.invitation.create({
    data: { tenantId, email, role, token, invitedBy, expiresAt },
  });
}
