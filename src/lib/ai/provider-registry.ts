import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/encryption";
import { createAiAdapter } from "./provider-factory";
import { recordAiActivity } from "./usage";
import type {
  AiProviderAdapter,
  AiProviderType,
  CompletionRequest,
  CompletionResponse,
} from "./types";
import {
  AiError,
  NoProviderConfiguredError,
  FallbackExhaustedError,
  RateLimitError,
  QuotaExhaustedError,
  NetworkTimeoutError,
  ProviderUnavailableError,
  InvalidApiKeyError,
  sanitizeErrorMessage,
} from "./errors";

export interface ResolvedProvider {
  adapter: AiProviderAdapter;
  configId: string;
  providerType: AiProviderType;
  model: string;
  isFallback: boolean;
}

export interface ResolveOptions {
  providerId?: string;
  providerType?: AiProviderType;
  allowFallback?: boolean;
}

/**
 * Resolves the primary active AI provider adapter from the authoritative PostgreSQL store,
 * falling back to the legacy ANTHROPIC_API_KEY if no DB provider is configured yet.
 */
export async function resolvePrimaryProvider(options: ResolveOptions = {}): Promise<ResolvedProvider> {
  // 1. Explicit provider ID
  if (options.providerId) {
    const config = await prisma.aiProviderConfig.findUnique({
      where: { id: options.providerId, isActive: true },
    });
    if (config) {
      const apiKey = decryptSecret(config.encryptedApiKey);
      const adapter = createAiAdapter({
        providerType: config.providerType,
        apiKey,
        model: config.defaultModel,
        baseUrl: config.baseUrl,
      });
      return {
        adapter,
        configId: config.id,
        providerType: config.providerType,
        model: config.defaultModel,
        isFallback: false,
      };
    }
  }

  // 2. Explicit provider type
  if (options.providerType) {
    const config = await prisma.aiProviderConfig.findFirst({
      where: { providerType: options.providerType, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    if (config) {
      const apiKey = decryptSecret(config.encryptedApiKey);
      const adapter = createAiAdapter({
        providerType: config.providerType,
        apiKey,
        model: config.defaultModel,
        baseUrl: config.baseUrl,
      });
      return {
        adapter,
        configId: config.id,
        providerType: config.providerType,
        model: config.defaultModel,
        isFallback: false,
      };
    }
  }

  // 3. Default active provider
  const defaultConfig = await prisma.aiProviderConfig.findFirst({
    where: { isActive: true, isDefault: true },
  });

  if (defaultConfig) {
    const apiKey = decryptSecret(defaultConfig.encryptedApiKey);
    const adapter = createAiAdapter({
      providerType: defaultConfig.providerType,
      apiKey,
      model: defaultConfig.defaultModel,
      baseUrl: defaultConfig.baseUrl,
    });
    return {
      adapter,
      configId: defaultConfig.id,
      providerType: defaultConfig.providerType,
      model: defaultConfig.defaultModel,
      isFallback: false,
    };
  }

  // 4. Any active provider if none is explicitly marked default
  const anyActive = await prisma.aiProviderConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (anyActive) {
    const apiKey = decryptSecret(anyActive.encryptedApiKey);
    const adapter = createAiAdapter({
      providerType: anyActive.providerType,
      apiKey,
      model: anyActive.defaultModel,
      baseUrl: anyActive.baseUrl,
    });
    return {
      adapter,
      configId: anyActive.id,
      providerType: anyActive.providerType,
      model: anyActive.defaultModel,
      isFallback: false,
    };
  }

  // 5. Check legacy ANTHROPIC_API_KEY environment variable for backward compatibility
  const legacyAnthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (legacyAnthropic) {
    const adapter = createAiAdapter({
      providerType: "ANTHROPIC",
      apiKey: legacyAnthropic,
      model: "claude-3-5-haiku-20241022",
    });
    return {
      adapter,
      configId: "legacy_anthropic",
      providerType: "ANTHROPIC",
      model: "claude-3-5-haiku-20241022",
      isFallback: false,
    };
  }

  throw new NoProviderConfiguredError();
}

/**
 * Resolves the configured active secondary fallback provider, if one exists.
 */
export async function resolveFallbackProvider(excludeConfigId?: string): Promise<ResolvedProvider | null> {
  const fallbackConfig = await prisma.aiProviderConfig.findFirst({
    where: {
      isActive: true,
      isFallback: true,
      ...(excludeConfigId ? { id: { not: excludeConfigId } } : {}),
    },
    orderBy: [{ fallbackPriority: "desc" }, { createdAt: "desc" }],
  });

  if (!fallbackConfig) {
    return null;
  }

  try {
    const apiKey = decryptSecret(fallbackConfig.encryptedApiKey);
    const adapter = createAiAdapter({
      providerType: fallbackConfig.providerType,
      apiKey,
      model: fallbackConfig.defaultModel,
      baseUrl: fallbackConfig.baseUrl,
    });
    return {
      adapter,
      configId: fallbackConfig.id,
      providerType: fallbackConfig.providerType,
      model: fallbackConfig.defaultModel,
      isFallback: true,
    };
  } catch {
    return null;
  }
}

/**
 * Determines whether an error is eligible for fallback to a secondary provider.
 */
export function isEligibleForFallback(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof QuotaExhaustedError) return true;
  if (error instanceof NetworkTimeoutError) return true;
  if (error instanceof ProviderUnavailableError) return true;
  if (error instanceof InvalidApiKeyError) return true;

  if (error instanceof AiError && error.isRetryable) return true;

  return false;
}

/**
 * High-level orchestration function to execute an AI text generation request
 * with bounded retries, deadline enforcement, fallback handling, and usage recording.
 */
export async function executeAiCompletion(
  req: CompletionRequest,
  options: ResolveOptions = {}
): Promise<CompletionResponse> {
  const start = Date.now();
  const allowFallback = req.allowFallback ?? options.allowFallback ?? true;
  const overallTimeoutMs = req.timeoutMs ?? 45000;

  // Enforce overall request deadline via AbortController
  const overallController = new AbortController();
  const deadlineTimer = setTimeout(() => overallController.abort(), overallTimeoutMs);

  if (req.abortSignal) {
    req.abortSignal.addEventListener("abort", () => overallController.abort());
  }

  const primary = await resolvePrimaryProvider(options);

  try {
    // Attempt 1: Primary provider
    const response = await primary.adapter.generateText({
      ...req,
      abortSignal: overallController.signal,
      timeoutMs: Math.min(30000, overallTimeoutMs),
    });

    clearTimeout(deadlineTimer);

    // Persist usage
    void recordAiActivity({
      tenantId: req.tenantId,
      userId: req.userId,
      feature: req.feature ?? "general",
      provider: response.provider,
      model: response.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      durationMs: response.durationMs,
      isFallback: false,
      status: "SUCCESS",
    });

    return response;
  } catch (primaryErr: unknown) {
    // Check if client cancelled
    if (overallController.signal.aborted && req.abortSignal?.aborted) {
      clearTimeout(deadlineTimer);
      throw primaryErr;
    }

    // Check if fallback is permitted and eligible
    if (!allowFallback || !isEligibleForFallback(primaryErr)) {
      clearTimeout(deadlineTimer);
      void recordAiActivity({
        tenantId: req.tenantId,
        userId: req.userId,
        feature: req.feature ?? "general",
        provider: primary.providerType,
        model: primary.model,
        promptTokens: 0,
        completionTokens: 0,
        durationMs: Date.now() - start,
        isFallback: false,
        status: "ERROR",
        errorMessage: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
      });
      throw primaryErr;
    }

    // Attempt 2: Fallback provider
    const fallback = await resolveFallbackProvider(primary.configId);
    if (!fallback) {
      clearTimeout(deadlineTimer);
      throw primaryErr;
    }

    const remainingTimeoutMs = Math.max(5000, overallTimeoutMs - (Date.now() - start));

    try {
      const fallbackResponse = await fallback.adapter.generateText({
        ...req,
        abortSignal: overallController.signal,
        timeoutMs: remainingTimeoutMs,
      });

      clearTimeout(deadlineTimer);

      const enhancedResponse: CompletionResponse = {
        ...fallbackResponse,
        isFallback: true,
        fallbackDetails: {
          attemptedProviders: [primary.providerType, fallback.providerType],
          originalError: sanitizeErrorMessage(
            primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
          ),
        },
      };

      void recordAiActivity({
        tenantId: req.tenantId,
        userId: req.userId,
        feature: req.feature ?? "general",
        provider: fallback.providerType,
        model: fallback.model,
        promptTokens: enhancedResponse.usage.promptTokens,
        completionTokens: enhancedResponse.usage.completionTokens,
        totalTokens: enhancedResponse.usage.totalTokens,
        durationMs: enhancedResponse.durationMs,
        isFallback: true,
        status: "SUCCESS",
      });

      return enhancedResponse;
    } catch (fallbackErr: unknown) {
      clearTimeout(deadlineTimer);

      void recordAiActivity({
        tenantId: req.tenantId,
        userId: req.userId,
        feature: req.feature ?? "general",
        provider: fallback.providerType,
        model: fallback.model,
        promptTokens: 0,
        completionTokens: 0,
        durationMs: Date.now() - start,
        isFallback: true,
        status: "ERROR",
        errorMessage: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });

      throw new FallbackExhaustedError(
        `Primary provider (${primary.providerType}) failed with: ${sanitizeErrorMessage(primaryErr)}; Fallback provider (${fallback.providerType}) also failed with: ${sanitizeErrorMessage(fallbackErr)}`
      );
    }
  }
}
