import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import { encryptSecret, maskApiKey } from "@/lib/crypto/encryption";
import { validateCustomEndpointUrl } from "@/lib/ai/ssrf";
import type { SafeAiProviderConfig } from "@/lib/ai/types";
import type { AiProviderConfig } from "@/generated/prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateProviderSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().trim().min(1).optional(), // Replacement key
  baseUrl: z.string().trim().nullable().optional(),
  defaultModel: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  isFallback: z.boolean().optional(),
  fallbackPriority: z.number().int().min(0).max(100).optional(),
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const { id } = await params;
  const provider = await prisma.aiProviderConfig.findUnique({
    where: { id },
  });

  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  return NextResponse.json({ provider: formatSafeConfig(provider) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.aiProviderConfig.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateProviderSchema.safeParse(body);
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

  const updateData: Record<string, unknown> = {
    updatedById: user.id,
  };

  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.defaultModel !== undefined) updateData.defaultModel = data.defaultModel;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.isFallback !== undefined) updateData.isFallback = data.isFallback;
  if (data.fallbackPriority !== undefined) updateData.fallbackPriority = data.fallbackPriority;

  if (data.baseUrl !== undefined) {
    if (data.baseUrl) {
      try {
        const url = validateCustomEndpointUrl(data.baseUrl);
        updateData.baseUrl = url.toString().replace(/\/+$/, "");
      } catch (err: unknown) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid endpoint URL" },
          { status: 400 }
        );
      }
    } else {
      updateData.baseUrl = null;
    }
  }

  // Key replacement
  let keyReplaced = false;
  if (data.apiKey) {
    try {
      updateData.encryptedApiKey = encryptSecret(data.apiKey);
      updateData.maskedApiKey = maskApiKey(data.apiKey);
      updateData.healthStatus = "UNKNOWN"; // Reset health status on new key
      keyReplaced = true;
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Encryption failed. Verify APP_ENCRYPTION_KEY." },
        { status: 500 }
      );
    }
  }

  const updatedProvider = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.aiProviderConfig.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      updateData.isDefault = true;
      updateData.isFallback = false;
    } else if (data.isDefault === false) {
      updateData.isDefault = false;
    }

    if (data.isFallback) {
      updateData.isFallback = true;
      if (!data.isDefault) {
        updateData.isDefault = false;
      }
    }

    return tx.aiProviderConfig.update({
      where: { id },
      data: updateData,
    });
  });

  // Record audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "ADMIN_UPDATED_AI_PROVIDER",
      target: `AI_PROVIDER:${id}`,
      metadata: {
        fieldsUpdated: Object.keys(data),
        keyReplaced,
        isDefault: updatedProvider.isDefault,
        isActive: updatedProvider.isActive,
      },
    },
  }).catch(() => {});

  return NextResponse.json({ provider: formatSafeConfig(updatedProvider) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.aiProviderConfig.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  await prisma.aiProviderConfig.delete({
    where: { id },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "ADMIN_DELETED_AI_PROVIDER",
      target: `AI_PROVIDER:${id}`,
      metadata: {
        providerType: existing.providerType,
        displayName: existing.displayName,
      },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, message: "Provider deleted successfully." });
}
