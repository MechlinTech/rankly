import { prisma } from "@/lib/db";
import { getCurrentUser } from "./session";
import type { Role } from "@/generated/prisma/client";

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Returns the authenticated user's first active tenant membership.
 * v1 simplification: a user belongs to one primary tenant workspace.
 * Multi-tenant switching (a user active in several tenants at once) is not built yet.
 */
export async function getCurrentTenantContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, isActive: true },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return null;

  return { user, tenant: membership.tenant, role: membership.role, membership };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

export async function generateUniqueTenantSlug(base: string): Promise<string> {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let suffix = 1;

  while (await prisma.tenant.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}
