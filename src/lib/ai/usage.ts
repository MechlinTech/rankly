import { prisma } from "@/lib/db";
import { sanitizeErrorMessage } from "./errors";

export interface LogAiUsageParams {
  tenantId?: string | null;
  userId?: string | null;
  feature: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  durationMs?: number | null;
  isFallback?: boolean;
  status?: "SUCCESS" | "ERROR";
  errorMessage?: string | null;
}

// Approximate cost per 1M tokens (USD)
const PRICING_TABLE: Record<string, { promptPerM: number; completionPerM: number }> = {
  // OpenAI
  "gpt-6-astra": { promptPerM: 2.0, completionPerM: 8.0 },
  "gpt-6.1-sol": { promptPerM: 3.5, completionPerM: 14.0 },
  "gpt-6-luna": { promptPerM: 0.15, completionPerM: 0.6 },
  "gpt-5.6-cyber": { promptPerM: 1.0, completionPerM: 4.0 },
  "gpt-oss-120b": { promptPerM: 0.5, completionPerM: 1.5 },
  "gpt-4o-mini": { promptPerM: 0.15, completionPerM: 0.6 },
  "gpt-4o": { promptPerM: 2.5, completionPerM: 10.0 },
  "o3-mini": { promptPerM: 1.1, completionPerM: 4.4 },
  "o1": { promptPerM: 15.0, completionPerM: 60.0 },
  // Anthropic
  "claude-sonnet-5-5": { promptPerM: 3.0, completionPerM: 15.0 },
  "claude-haiku-5-5": { promptPerM: 0.8, completionPerM: 4.0 },
  "claude-opus-5-5": { promptPerM: 15.0, completionPerM: 75.0 },
  "claude-fable-5-1": { promptPerM: 2.5, completionPerM: 10.0 },
  "claude-3-7-sonnet-20250219": { promptPerM: 3.0, completionPerM: 15.0 },
  "claude-3-5-sonnet-20241022": { promptPerM: 3.0, completionPerM: 15.0 },
  "claude-3-5-haiku-20241022": { promptPerM: 0.8, completionPerM: 4.0 },
  "claude-3-haiku-20240307": { promptPerM: 0.25, completionPerM: 1.25 },
  // Gemini
  "gemini-3.8-flash": { promptPerM: 0.1, completionPerM: 0.4 },
  "gemini-4-argon": { promptPerM: 1.5, completionPerM: 6.0 },
  "gemini-omni-flash": { promptPerM: 0.15, completionPerM: 0.6 },
  "gemini-2.5-flash": { promptPerM: 0.1, completionPerM: 0.4 },
  "gemini-2.5-pro": { promptPerM: 1.25, completionPerM: 5.0 },
  "gemini-2.0-flash": { promptPerM: 0.1, completionPerM: 0.4 },
  "gemini-1.5-flash": { promptPerM: 0.075, completionPerM: 0.3 },
  "gemini-1.5-pro": { promptPerM: 1.25, completionPerM: 5.0 },
  // xAI
  "grok-4.7": { promptPerM: 2.0, completionPerM: 10.0 },
  "grok-2-latest": { promptPerM: 2.0, completionPerM: 10.0 },
  "grok-2-vision-1212": { promptPerM: 2.0, completionPerM: 10.0 },
  "grok-2-mini": { promptPerM: 0.5, completionPerM: 2.0 },
  // OpenAI-Compatible (DeepSeek)
  "deepseek-chat": { promptPerM: 0.27, completionPerM: 1.1 },
  "deepseek-reasoner": { promptPerM: 0.55, completionPerM: 2.19 },
};

/**
 * Calculates approximate cost in USD for known models based on token usage.
 * Returns null if pricing is unknown.
 */
export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const cleanModel = model.toLowerCase().replace(/^models\//, "");
  const pricing = PRICING_TABLE[cleanModel];
  if (!pricing) return null;

  const promptCost = (promptTokens / 1_000_000) * pricing.promptPerM;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPerM;
  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Persists an AI activity/usage record to AiActivityLog.
 * Fails gracefully without throwing to prevent breaking user workflows.
 */
export async function recordAiActivity(params: LogAiUsageParams): Promise<void> {
  try {
    const totalTokens = params.totalTokens ?? params.promptTokens + params.completionTokens;
    const costUsd = estimateCostUsd(params.model, params.promptTokens, params.completionTokens);

    await prisma.aiActivityLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens,
        durationMs: params.durationMs ?? null,
        costUsd,
        isFallback: params.isFallback ?? false,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ? sanitizeErrorMessage(params.errorMessage) : null,
      },
    });
  } catch {
    // Fail closed/silent for telemetry: logging errors should never break main operations
  }
}
