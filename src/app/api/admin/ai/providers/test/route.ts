import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { checkAndUpdateProviderHealth } from "@/lib/ai/health";
import { createAiAdapter } from "@/lib/ai/provider-factory";
import { DEFAULT_MODELS, type AiProviderType } from "@/lib/ai/types";
import { validateCustomEndpointUrl } from "@/lib/ai/ssrf";
import { z } from "zod";

export const dynamic = "force-dynamic";

const testProviderSchema = z.object({
  providerId: z.string().trim().optional(),
  providerType: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "XAI", "OPENAI_COMPATIBLE"]).optional(),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().optional(),
  baseUrl: z.string().trim().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const body = await req.json().catch(() => null);
  const parsed = testProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid test payload." }, { status: 400 });
  }

  const { providerId, providerType, apiKey, model, baseUrl } = parsed.data;

  // Case 1: Test existing saved provider by ID
  if (providerId) {
    const result = await checkAndUpdateProviderHealth(providerId);
    return NextResponse.json({
      success: result.status === "CONNECTED",
      ...result,
    });
  }

  // Case 2: Test unsaved in-flight credentials
  if (!providerType || !apiKey) {
    return NextResponse.json(
      { error: "providerType and apiKey are required when testing unsaved credentials." },
      { status: 400 }
    );
  }

  let validatedBaseUrl: string | null = null;
  if (baseUrl) {
    try {
      const url = validateCustomEndpointUrl(baseUrl);
      validatedBaseUrl = url.toString().replace(/\/+$/, "");
    } catch (err: unknown) {
      return NextResponse.json(
        {
          success: false,
          status: "DISCONNECTED",
          latencyMs: 0,
          message: err instanceof Error ? err.message : "Invalid endpoint URL.",
        },
        { status: 400 }
      );
    }
  }

  const modelToUse = model?.trim() || DEFAULT_MODELS[providerType as AiProviderType];

  try {
    const adapter = createAiAdapter({
      providerType: providerType as AiProviderType,
      apiKey,
      model: modelToUse,
      baseUrl: validatedBaseUrl,
    });

    const result = await adapter.testConnection(10000);
    return NextResponse.json({
      success: result.status === "CONNECTED",
      ...result,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      status: "DISCONNECTED",
      latencyMs: 0,
      message: err instanceof Error ? err.message : "Failed to instantiate provider adapter.",
    });
  }
}
