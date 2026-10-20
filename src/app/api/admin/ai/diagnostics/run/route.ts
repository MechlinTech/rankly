import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { executeAiCompletion } from "@/lib/ai/provider-registry";
import { z } from "zod";

export const dynamic = "force-dynamic";

const diagnosticSchema = z.object({
  prompt: z.string().trim().max(100).optional().default("Respond with the exact word: Operational."),
  providerId: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const body = await req.json().catch(() => ({}));
  const parsed = diagnosticSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid diagnostic parameters." }, { status: 400 });
  }

  const { prompt, providerId } = parsed.data;

  try {
    const result = await executeAiCompletion(
      {
        feature: "admin-diagnostic",
        messages: [
          { role: "system", content: "You are an automated diagnostic evaluator. Keep response under 10 tokens." },
          { role: "user", content: prompt },
        ],
        maxTokens: 15,
        temperature: 0,
        timeoutMs: 15000,
        userId: user.id,
        tenantId: undefined, // Platform-level diagnostic, no tenant association
      },
      {
        providerId,
        allowFallback: true,
      }
    );

    return NextResponse.json({
      ok: true,
      text: result.text.trim(),
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      isFallback: result.isFallback,
      fallbackDetails: result.fallbackDetails ?? null,
      usage: result.usage,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Diagnostic execution failed.",
      },
      { status: 500 }
    );
  }
}
