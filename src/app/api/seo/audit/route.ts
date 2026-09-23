import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSiteAudit } from "@/lib/seo/audit";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { suspensionCheck } from "@/lib/auth/suspension";
import { getOrCreateProjectForDomain } from "@/lib/seo/project";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { assertCanRunAudit, EntitlementError } from "@/lib/billing/entitlements";

const requestSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+$/, "Must be a bare domain, e.g. example.com"),
  maxPages: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  if (isRateLimited(`audit:${ctx.tenant.id}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many audit runs. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assertCanRunAudit(ctx.tenant);
  } catch (err) {
    if (err instanceof EntitlementError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    throw err;
  }

  const { domain, maxPages } = parsed.data;
  const project = await getOrCreateProjectForDomain(ctx.tenant.id, domain);

  const auditRun = await prisma.siteAuditRun.create({
    data: { projectId: project.id, status: "RUNNING", startedAt: new Date() },
  });

  try {
    const result = await runSiteAudit(domain, maxPages ?? 20);

    await prisma.$transaction([
      prisma.siteAuditIssue.createMany({
        data: result.issues.map((issue) => ({
          auditRunId: auditRun.id,
          url: issue.url,
          severity: issue.severity,
          category: issue.category,
          message: issue.message,
        })),
      }),
      prisma.siteAuditRun.update({
        where: { id: auditRun.id },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          pagesCrawled: result.pagesCrawled,
          issuesFound: result.issues.length,
        },
      }),
    ]);

    return NextResponse.json({ ...result, auditRunId: auditRun.id, projectId: project.id });
  } catch {
    await prisma.siteAuditRun.update({
      where: { id: auditRun.id },
      data: { status: "FAILED", finishedAt: new Date() },
    });
    return NextResponse.json({ error: "Audit failed to run." }, { status: 500 });
  }
}
