import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRankings } from "@/lib/seo/rankings";
import { getCurrentTenantContext } from "@/lib/auth/tenant";
import { suspensionCheck } from "@/lib/auth/suspension";
import { getOrCreateProjectForDomain } from "@/lib/seo/project";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { normalizeDomain } from "@/lib/seo/providers/openserp";

const requestSchema = z.object({
  domain: z
    .string()
    .trim()
    .transform((val) => normalizeDomain(val))
    .pipe(
      z
        .string()
        .min(3, "Domain must be at least 3 characters.")
        .max(255, "Domain must be 255 characters or fewer.")
        .regex(/^[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+$/, "Please enter a valid domain (e.g. example.com)")
    ),
  terms: z
    .array(z.string().trim().min(1).max(200))
    .min(1, "Please provide at least one keyword term.")
    .max(50, "You can check up to 50 keywords at once.")
    .transform((terms) => {
      const seen = new Set<string>();
      return terms
        .map((t) => t.trim())
        .filter((t) => {
          const lower = t.toLowerCase();
          if (!t || seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
    }),
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
    return NextResponse.json({ error: "Too many ranking checks. Please wait a moment and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const firstFieldErr = Object.values(flattened.fieldErrors).flat()[0];
    const firstFormErr = flattened.formErrors[0];
    const message = firstFieldErr || firstFormErr || "Invalid request parameters.";
    return NextResponse.json({ error: message, details: flattened }, { status: 400 });
  }

  const { domain, terms, engine = "google", device = "desktop" } = parsed.data;

  try {
    const { getKeywordDataProvider } = await import("@/lib/seo/providers");
    const keywordProvider = await getKeywordDataProvider();

    const [result, metricsList, project] = await Promise.all([
      checkRankings(domain, terms, engine, device),
      keywordProvider.getMetrics(terms, "en-US").catch(() => []),
      getOrCreateProjectForDomain(ctx.tenant.id, domain),
    ]);

    const metricsMap = new Map(metricsList.map((m) => [m.term.toLowerCase(), m]));
    const enrichedResults = [];

    for (const r of result.results) {
      const termLower = r.term.toLowerCase();
      const m = metricsMap.get(termLower);

      const keyword = await prisma.keyword.upsert({
        where: { projectId_term_locale: { projectId: project.id, term: r.term, locale: "en-US" } },
        create: {
          projectId: project.id,
          term: r.term,
          locale: "en-US",
          searchVolume: m?.searchVolume ?? null,
          difficulty: m?.difficulty ?? null,
          cpc: m?.cpc ?? null,
          intent: m?.intent ?? null,
        },
        update: {
          searchVolume: m?.searchVolume ?? undefined,
          difficulty: m?.difficulty ?? undefined,
          cpc: m?.cpc ?? undefined,
          intent: m?.intent ?? undefined,
        },
      });

      // Find previous rank snapshot to compute position delta
      const prevSnapshot = await prisma.rankSnapshot.findFirst({
        where: { projectId: project.id, keywordId: keyword.id },
        orderBy: { capturedAt: "desc" },
      });

      let positionChange: number | null = null;
      if (prevSnapshot && prevSnapshot.position != null && r.position != null) {
        positionChange = prevSnapshot.position - r.position;
      }

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

      enrichedResults.push({
        ...r,
        previousPosition: prevSnapshot?.position ?? null,
        positionChange,
        metrics: m
          ? {
              searchVolume: m.searchVolume,
              difficulty: m.difficulty,
              cpc: m.cpc,
              intent: m.intent,
            }
          : null,
      });
    }

    return NextResponse.json({
      ...result,
      results: enrichedResults,
      projectId: project.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't fetch search rankings. Please try again.";
    console.error("[Rankings API] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
