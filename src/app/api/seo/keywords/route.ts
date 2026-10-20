import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { researchKeyword } from "@/lib/seo/keywords";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { suspensionCheck } from "@/lib/auth/suspension";
import { getOrCreateGeneralProject } from "@/lib/seo/project";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/auth/rate-limit";

const requestSchema = z.object({
  term: z.string().trim().min(1).max(200),
  locale: z.string().trim().min(2).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const suspended = suspensionCheck(ctx.tenant);
  if (suspended) return suspended;

  if (isRateLimited(`keywords:${ctx.tenant.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many keyword lookups. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { term, locale } = parsed.data;
  try {
    const result = await researchKeyword(term, locale ?? "en-US");

    let projectId: string | null = null;
    try {
      const project = await getOrCreateGeneralProject(ctx.tenant.id);
      projectId = project.id;

      const metricMap = new Map<string, typeof result.seed>();
      for (const m of [result.seed, ...result.related]) {
        if (m && m.term?.trim()) {
          const key = `${m.term.trim().toLowerCase()}_${m.locale || locale || "en-US"}`;
          if (!metricMap.has(key)) {
            metricMap.set(key, m);
          }
        }
      }

      await Promise.all(
        Array.from(metricMap.values()).map((m) =>
          prisma.keyword.upsert({
            where: { projectId_term_locale: { projectId: project.id, term: m.term, locale: m.locale } },
            create: {
              projectId: project.id,
              term: m.term,
              locale: m.locale,
              searchVolume: m.searchVolume,
              difficulty: m.difficulty,
              cpc: m.cpc,
              intent: m.intent,
            },
            update: {
              searchVolume: m.searchVolume,
              difficulty: m.difficulty,
              cpc: m.cpc,
              intent: m.intent,
            },
          })
        )
      );
    } catch (dbError) {
      console.warn("Could not persist keyword research metrics to project:", dbError);
    }

    return NextResponse.json({ ...result, projectId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyword research failed.";
    console.error("Keyword research request failed.", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
