import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/encryption";
import { createAiAdapter } from "./provider-factory";
import {
  type AiHealthStatus,
  type AiProviderType,
  type ProviderHealthCheckResult,
  DEFAULT_MODELS,
} from "./types";
import { sanitizeErrorMessage, QuotaExhaustedError, RateLimitError } from "./errors";
import { getIntegrationCredential } from "@/lib/admin/integration-credentials";

// Freshness thresholds
export const HEALTH_FRESH_MS = 15 * 60 * 1000; // 15 minutes
export const HEALTH_STALE_MS = 60 * 60 * 1000; // 60 minutes

export interface OverallHealthStatus {
  status: AiHealthStatus;
  activeProviderCount: number;
  defaultProvider: {
    id: string;
    displayName: string;
    providerType: AiProviderType;
    model: string;
    healthStatus: AiHealthStatus;
    lastLatencyMs: number | null;
    lastSuccessfulCheck: string | null;
    lastHealthCheck: string | null;
  } | null;
  fallbackProvider: {
    id: string;
    displayName: string;
    providerType: AiProviderType;
    model: string;
    healthStatus: AiHealthStatus;
  } | null;
  message: string;
}

/**
 * Runs an authenticated health check against a provider configuration and updates its database record.
 * Performs both reachability / credentials verification and live operational quota check.
 */
export async function checkAndUpdateProviderHealth(
  providerId: string,
  options?: { checkQuota?: boolean }
): Promise<ProviderHealthCheckResult> {
  const config = await prisma.aiProviderConfig.findUnique({
    where: { id: providerId },
  });

  if (!config) {
    return {
      status: "NOT_CONFIGURED",
      latencyMs: 0,
      message: "Provider configuration was not found.",
    };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(config.encryptedApiKey);
  } catch (err) {
    const errorMsg = sanitizeErrorMessage(err instanceof Error ? err.message : "Decryption failed.");
    await prisma.aiProviderConfig.update({
      where: { id: providerId },
      data: {
        healthStatus: "DISCONNECTED",
        lastHealthCheck: new Date(),
        lastErrorMessage: `Encryption key mismatch or corrupted secret: ${errorMsg}`,
      },
    }).catch(() => {});

    return {
      status: "DISCONNECTED",
      latencyMs: 0,
      message: "Failed to decrypt provider API key.",
      errorCategory: "CONFIGURATION_ERROR",
      connectionTest: {
        success: false,
        message: "Failed to decrypt provider API key.",
        latencyMs: 0,
      },
      operationalCheck: {
        success: false,
        status: "FAILED",
        message: "Configuration error: Decryption failed.",
      },
    };
  }

  const adapter = createAiAdapter({
    providerType: config.providerType,
    apiKey,
    model: config.defaultModel,
    baseUrl: config.baseUrl,
  });

  // Step 1: Reachability & Auth check
  const checkResult = await adapter.testConnection(10000);

  if (checkResult.status === "DISCONNECTED") {
    await prisma.aiProviderConfig.update({
      where: { id: providerId },
      data: {
        healthStatus: "DISCONNECTED",
        lastHealthCheck: new Date(),
        lastLatencyMs: checkResult.latencyMs,
        lastErrorMessage: checkResult.message,
      },
    }).catch(() => {});

    return {
      ...checkResult,
      connectionTest: {
        success: false,
        message: checkResult.message,
        latencyMs: checkResult.latencyMs,
      },
      operationalCheck: {
        success: false,
        status: "FAILED",
        message: "Skipped: Connection reachability failed.",
      },
    };
  }

  // Step 2: Live Operational / Quota Probe
  const shouldCheckQuota = options?.checkQuota ?? true;
  let finalStatus: AiHealthStatus = checkResult.status;
  let finalErrorMessage: string | null = null;
  let operationalResult: {
    success: boolean;
    status: "OPERATIONAL" | "QUOTA_EXHAUSTED" | "MODEL_NOT_FOUND" | "RATE_LIMITED" | "FAILED";
    message: string;
    latencyMs?: number;
  } = {
    success: false,
    status: "FAILED",
    message: "Operational check pending",
  };

  if (shouldCheckQuota) {
    const probeStart = Date.now();
    try {
      await adapter.generateText({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
        temperature: 0,
        timeoutMs: 15000,
        feature: "health-probe",
      });
      const probeLatency = Date.now() - probeStart;
      operationalResult = {
        success: true,
        status: "OPERATIONAL",
        message: `Operational: Model "${config.defaultModel}" responded in ${probeLatency}ms.`,
        latencyMs: probeLatency,
      };
      finalStatus = "CONNECTED";
    } catch (err: unknown) {
      const probeLatency = Date.now() - probeStart;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isQuota =
        err instanceof QuotaExhaustedError ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("credit") ||
        errMsg.toLowerCase().includes("billing") ||
        errMsg.toLowerCase().includes("insufficient_quota");

      const isRateLimit =
        err instanceof RateLimitError || errMsg.toLowerCase().includes("rate limit");

      if (isQuota) {
        operationalResult = {
          success: false,
          status: "QUOTA_EXHAUSTED",
          message: `Provider quota exhausted: You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.`,
          latencyMs: probeLatency,
        };
        finalStatus = "DEGRADED";
        finalErrorMessage = operationalResult.message;
      } else if (isRateLimit) {
        operationalResult = {
          success: false,
          status: "RATE_LIMITED",
          message: `Rate limited during generation: ${errMsg}`,
          latencyMs: probeLatency,
        };
        finalStatus = "DEGRADED";
        finalErrorMessage = operationalResult.message;
      } else {
        // Check if an automatic fallback to the verified default model resolves the issue
        const fallbackModel = DEFAULT_MODELS[config.providerType];
        let recovered = false;

        if (fallbackModel && fallbackModel !== config.defaultModel) {
          try {
            const fallbackAdapter = createAiAdapter({
              providerType: config.providerType,
              apiKey,
              model: fallbackModel,
              baseUrl: config.baseUrl,
            });
            const fbStart = Date.now();
            await fallbackAdapter.generateText({
              messages: [{ role: "user", content: "ping" }],
              maxTokens: 5,
              temperature: 0,
              timeoutMs: 15000,
              feature: "health-probe-fallback",
            });
            const fbLatency = Date.now() - fbStart;

            // Auto-heal the provider configuration in the database
            await prisma.aiProviderConfig.update({
              where: { id: providerId },
              data: { defaultModel: fallbackModel },
            }).catch(() => {});

            operationalResult = {
              success: true,
              status: "OPERATIONAL",
              message: `Operational: Model "${fallbackModel}" responded in ${fbLatency}ms (auto-recovered from "${config.defaultModel}" timeout/unavailability).`,
              latencyMs: fbLatency,
            };
            finalStatus = "CONNECTED";
            finalErrorMessage = null;
            recovered = true;
          } catch {
            // Keep original error if fallback also fails
          }
        }

        if (!recovered) {
          operationalResult = {
            success: false,
            status: "FAILED",
            message: `Generation failed for model "${config.defaultModel}": ${errMsg}`,
            latencyMs: probeLatency,
          };
          finalStatus = "DEGRADED";
          finalErrorMessage = operationalResult.message;
        }
      }
    }
  } else {
    operationalResult = {
      success: true,
      status: "OPERATIONAL",
      message: "Operational generation probe skipped.",
    };
  }

  // Update DB record with health outcome
  await prisma.aiProviderConfig.update({
    where: { id: providerId },
    data: {
      healthStatus: finalStatus,
      lastHealthCheck: new Date(),
      lastLatencyMs: checkResult.latencyMs,
      lastErrorMessage: finalStatus === "CONNECTED" ? null : (finalErrorMessage || checkResult.message),
      ...(finalStatus === "CONNECTED" ? { lastSuccessfulCheck: new Date() } : {}),
    },
  }).catch(() => {});

  return {
    status: finalStatus,
    latencyMs: checkResult.latencyMs,
    message: finalErrorMessage
      ? `Connected, but ${finalErrorMessage}`
      : checkResult.message,
    availableModels: checkResult.availableModels,
    errorCategory: finalStatus === "CONNECTED" ? undefined : (operationalResult.status === "QUOTA_EXHAUSTED" ? "QUOTA_EXHAUSTED" : checkResult.errorCategory),
    connectionTest: {
      success: true,
      message: checkResult.message,
      latencyMs: checkResult.latencyMs,
    },
    operationalCheck: operationalResult,
  };
}

/**
 * Evaluates overall platform AI health across configured providers.
 */
export async function getOverallAiHealth(): Promise<OverallHealthStatus> {
  const configs = await prisma.aiProviderConfig.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { fallbackPriority: "desc" }, { createdAt: "asc" }],
  });

  if (configs.length === 0) {
    // Check if legacy ANTHROPIC_API_KEY is configured in env
    const legacyAnthropic = (await getIntegrationCredential("ANTHROPIC_API_KEY"))?.trim();
    if (legacyAnthropic) {
      return {
        status: "UNKNOWN",
        activeProviderCount: 1,
        defaultProvider: {
          id: "legacy_anthropic",
          displayName: "Anthropic Claude (Legacy Environment)",
          providerType: "ANTHROPIC",
          model: "claude-3-5-haiku-20241022",
          healthStatus: "UNKNOWN",
          lastLatencyMs: null,
          lastSuccessfulCheck: null,
          lastHealthCheck: null,
        },
        fallbackProvider: null,
        message: "Configured via legacy ANTHROPIC_API_KEY environment variable. Run connection test to verify.",
      };
    }

    return {
      status: "NOT_CONFIGURED",
      activeProviderCount: 0,
      defaultProvider: null,
      fallbackProvider: null,
      message: "No AI provider is configured or activated.",
    };
  }

  const defaultConf = configs.find((c) => c.isDefault) || configs[0];
  const fallbackConf = configs.find((c) => c.isFallback && c.id !== defaultConf.id) || null;

  // Determine freshness
  let effectiveStatus: AiHealthStatus = defaultConf.healthStatus;
  const now = Date.now();

  if (defaultConf.lastHealthCheck) {
    const age = now - defaultConf.lastHealthCheck.getTime();
    if (age > HEALTH_STALE_MS && defaultConf.healthStatus === "CONNECTED") {
      effectiveStatus = "UNKNOWN";
    }
  } else {
    effectiveStatus = "UNKNOWN";
  }

  let summaryMsg = "";
  switch (effectiveStatus) {
    case "CONNECTED":
      summaryMsg = `${defaultConf.displayName} is connected and operational.`;
      break;
    case "DEGRADED":
      summaryMsg = `${defaultConf.displayName} is degraded. ${defaultConf.lastErrorMessage || ""}`.trim();
      break;
    case "DISCONNECTED":
      summaryMsg = `${defaultConf.displayName} is disconnected. ${defaultConf.lastErrorMessage || "Check credentials."}`.trim();
      break;
    case "UNKNOWN":
      summaryMsg = `${defaultConf.displayName} connection status is unverified.`;
      break;
    default:
      summaryMsg = "Status unknown.";
  }

  return {
    status: effectiveStatus,
    activeProviderCount: configs.length,
    defaultProvider: {
      id: defaultConf.id,
      displayName: defaultConf.displayName,
      providerType: defaultConf.providerType,
      model: defaultConf.defaultModel,
      healthStatus: effectiveStatus,
      lastLatencyMs: defaultConf.lastLatencyMs,
      lastSuccessfulCheck: defaultConf.lastSuccessfulCheck ? defaultConf.lastSuccessfulCheck.toISOString() : null,
      lastHealthCheck: defaultConf.lastHealthCheck ? defaultConf.lastHealthCheck.toISOString() : null,
    },
    fallbackProvider: fallbackConf
      ? {
          id: fallbackConf.id,
          displayName: fallbackConf.displayName,
          providerType: fallbackConf.providerType,
          model: fallbackConf.defaultModel,
          healthStatus: fallbackConf.healthStatus,
        }
      : null,
    message: summaryMsg,
  };
}
