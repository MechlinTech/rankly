import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRankings } from "@/lib/seo/rankings";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { suspensionCheck } from "@/lib/auth/suspension";
import { getOrCreateProjectForDomain } from "@/lib/seo/project";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/auth/rate-limit";

const requestSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .regex(/^[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+$/, "Must be a bare domain, e.g. example.com"),
  terms: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  engine: z.enum(["google", "bing"]).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  if (isRateLimited(`rankings:${ctx.tenant.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many ranking checks. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { domain, terms, engine, device } = parsed.data;
  const result = await checkRankings(domain, terms, engine ?? "google", device ?? "desktop");
  const project = await getOrCreateProjectForDomain(ctx.tenant.id, domain);

  for (const r of result.results) {
    const keyword = await prisma.keyword.upsert({
      where: { projectId_term_locale: { projectId: project.id, term: r.term, locale: "en-US" } },
      create: { projectId: project.id, term: r.term, locale: "en-US" },
      update: {},
    });

    await prisma.rankSnapshot.create({
      data: {
        projectId: project.id,
        keywordId: keyword.id,
        position: r.position,
        url: r.url,
        searchEngine: r.engine,
        device: r.device,
        capturedAt: r.capturedAt,
      },
    });
  }

  return NextResponse.json({ ...result, projectId: project.id });
}
