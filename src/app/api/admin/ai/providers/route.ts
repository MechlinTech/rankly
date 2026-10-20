import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import { encryptSecret, maskApiKey } from "@/lib/crypto/encryption";
import { validateCustomEndpointUrl } from "@/lib/ai/ssrf";
import { DEFAULT_MODELS, type SafeAiProviderConfig } from "@/lib/ai/types";
import type { AiProviderConfig } from "@/generated/prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createProviderSchema = z.object({
  providerType: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "XAI", "OPENAI_COMPATIBLE"]),
  displayName: z.string().trim().min(1, "Display name is required").max(100),
  apiKey: z.string().trim().min(1, "API key is required"),
  baseUrl: z.string().trim().nullable().optional(),
  defaultModel: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  isFallback: z.boolean().optional().default(false),
  fallbackPriority: z.number().int().min(0).max(100).optional().default(0),
});

function formatSafeConfig(c: AiProviderConfig): SafeAiProviderConfig {
  return {
    id: c.id,
    providerType: c.providerType,
    displayName: c.displayName,
    maskedApiKey: c.maskedApiKey,
    baseUrl: c.baseUrl,
    defaultModel: c.defaultModel,
    isActive: c.isActive,
    isDefault: c.isDefault,
    isFallback: c.isFallback,
    fallbackPriority: c.fallbackPriority,
    healthStatus: c.healthStatus,
    lastHealthCheck: c.lastHealthCheck ? c.lastHealthCheck.toISOString() : null,
    lastSuccessfulCheck: c.lastSuccessfulCheck ? c.lastSuccessfulCheck.toISOString() : null,
    lastLatencyMs: c.lastLatencyMs,
    lastErrorMessage: c.lastErrorMessage,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET() {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const providers = await prisma.aiProviderConfig.findMany({
    orderBy: [{ isDefault: "desc" }, { fallbackPriority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    providers: providers.map(formatSafeConfig),
  });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const body = await req.json().catch(() => null);
  const parsed = createProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Mutual Exclusivity: If isDefault is set to true, automatically set isFallback = false
  if (data.isDefault) {
    data.isFallback = false;
  }

  // Validate custom base URL if provided
  let validatedBaseUrl: string | null = null;
  if (data.baseUrl) {
    try {
      const url = validateCustomEndpointUrl(data.baseUrl);
      validatedBaseUrl = url.toString().replace(/\/+$/, "");
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid endpoint URL" },
        { status: 400 }
      );
    }
  }

  const modelToUse = data.defaultModel?.trim() || DEFAULT_MODELS[data.providerType];

  let encryptedApiKey: string;
  try {
    encryptedApiKey = encryptSecret(data.apiKey);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Encryption failed. Verify APP_ENCRYPTION_KEY." },
      { status: 500 }
    );
  }

  const maskedApiKey = maskApiKey(data.apiKey);

  const newProvider = await prisma.$transaction(async (tx) => {
    // If setting as default, unset existing default providers
    if (data.isDefault) {
      await tx.aiProviderConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.aiProviderConfig.create({
      data: {
        providerType: data.providerType,
        displayName: data.displayName,
        encryptedApiKey,
        maskedApiKey,
        baseUrl: validatedBaseUrl,
        defaultModel: modelToUse,
        isActive: data.isActive,
        isDefault: data.isDefault,
        isFallback: data.isDefault ? false : data.isFallback,
        fallbackPriority: data.fallbackPriority,
        healthStatus: "UNKNOWN",
        createdById: user.id,
        updatedById: user.id,
      },
    });
  });

  // Record audit log without sensitive data
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "ADMIN_CREATED_AI_PROVIDER",
      target: `AI_PROVIDER:${newProvider.id}`,
      metadata: {
        providerType: data.providerType,
        displayName: data.displayName,
        model: modelToUse,
        isDefault: data.isDefault,
        isFallback: data.isFallback,
      },
    },
  }).catch(() => {});

  return NextResponse.json(
    { provider: formatSafeConfig(newProvider) },
    { status: 201 }
  );
}
