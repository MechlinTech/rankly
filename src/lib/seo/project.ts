import { prisma } from "@/lib/db";

const GENERAL_PROJECT_DOMAIN = "general.workspace";

/**
 * Gets or creates the project used for a given tenant + domain. Each tenant
 * gets one project per domain it audits/tracks — dedicated project management
 * UI (rename, delete, multiple projects per domain) isn't built yet.
 */
export async function getOrCreateProjectForDomain(tenantId: string, domain: string) {
  const existing = await prisma.project.findFirst({ where: { tenantId, domain } });
  if (existing) return existing;

  return prisma.project.create({
    data: { tenantId, domain, name: domain },
  });
}

/**
 * Placeholder project for domain-agnostic keyword research, used until
 * per-project keyword lists are built in the UI.
 */
export async function getOrCreateGeneralProject(tenantId: string) {
  const existing = await prisma.project.findFirst({
    where: { tenantId, domain: GENERAL_PROJECT_DOMAIN },
  });
  if (existing) return existing;

  return prisma.project.create({
    data: { tenantId, domain: GENERAL_PROJECT_DOMAIN, name: "General Keyword Research" },
  });
}
