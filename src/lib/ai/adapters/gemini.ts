import type {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  ProviderHealthCheckResult,
} from "../types";
import {
  AiError,
  InvalidApiKeyError,
  PermissionDeniedError,
  ModelNotFoundError,
  RateLimitError,
  QuotaExhaustedError,
  NetworkTimeoutError,
  ProviderUnavailableError,
  MalformedResponseError,
  sanitizeErrorMessage,
} from "../errors";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiAdapterOptions {
  apiKey: string;
  model: string;
}

export class GeminiAdapter implements AiProviderAdapter {
  readonly providerType = "GEMINI" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(options: GeminiAdapterOptions) {
    this.apiKey = options.apiKey?.trim();
    this.model = options.model?.trim() || "gemini-3.5-flash";

    if (!this.apiKey) {
      throw new InvalidApiKeyError("API key is required for Google Gemini.");
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "x-goog-api-key": this.apiKey,
      "Content-Type": "application/json",
      "User-Agent": "Rankly-AI-Engine/1.0",
    };
  }

  private cleanModelId(model: string): string {
    return model.startsWith("models/") ? model.slice(7) : model;
  }

  async testConnection(timeoutMs = 10000): Promise<ProviderHealthCheckResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const rawList = Array.isArray(data.models) ? data.models : [];
        const modelIds: string[] = rawList
          .map((m: { name?: string }) => (m.name ? this.cleanModelId(m.name) : undefined))
          .filter((id: string | undefined): id is string => typeof id === "string");

        return {
          status: "CONNECTED",
          latencyMs,
          message: `Google Gemini API connected (${modelIds.length} models available).`,
          availableModels: modelIds.slice(0, 50),
        };
      }

      const errText = await res.text().catch(() => "");
      return this.mapHttpErrorToHealthResult(res.status, errText, latencyMs);
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      return this.mapNetworkErrorToHealthResult(err, latencyMs);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return [];
      const data = await res.json().catch(() => ({}));
      if (!Array.isArray(data.models)) return [];
      return data.models
        .map((m: { name?: string }) => (m.name ? this.cleanModelId(m.name) : undefined))
        .filter((id: string | undefined): id is string => typeof id === "string");
    } catch {
      return [];
    }
  }

  async generateText(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? 30000;
    const modelToUse = this.cleanModelId(req.model ?? this.model);

    // Filter system messages
    const systemMessages = req.messages.filter((m) => m.role === "system");
    const systemPrompt = systemMessages.map((m) => m.content).join("\n\n").trim();

    // Transform messages to Gemini format: role 'user' or 'model'
    const nonSystem = req.messages.filter((m) => m.role !== "system");
    const contents = nonSystem.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: "Hello" }] });
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.responseFormat === "json_object" ? { responseMimeType: "application/json" } : {}),
      },
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    };

    let res!: Response;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const abortFromRequest = () => controller.abort();
        req.abortSignal?.addEventListener("abort", abortFromRequest, { once: true });

        try {
          res = await fetch(`${GEMINI_BASE_URL}/models/${modelToUse}:generateContent`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
          req.abortSignal?.removeEventListener("abort", abortFromRequest);
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - start;
        throw this.transformNetworkException(err, durationMs);
      }

      if (res.status !== 503 || attempt === maxAttempts - 1 || req.abortSignal?.aborted) break;

      // Google recommends exponential backoff for transient 503 UNAVAILABLE
      // responses. Keep retries bounded and add jitter to avoid synchronized retries.
      await res.body?.cancel().catch(() => {});
      const backoffMs = 800 * 2 ** attempt + Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    let modelUsed = modelToUse;
    let isFallback = false;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const isQuotaError = res.status === 429 && /quota|credit|billing|resource_exhausted/i.test(errText);
      const isEligibleFallback = isQuotaError && !modelToUse.includes("flash-lite") && (req.allowFallback ?? true);

      if (isEligibleFallback) {
        try {
          const fallbackModel = "gemini-3.5-flash-lite";
          const remainingMs = Math.max(5000, timeoutMs - (Date.now() - start));
          const fallbackRes = await fetch(`${GEMINI_BASE_URL}/models/${fallbackModel}:generateContent`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(remainingMs),
          });
          if (fallbackRes.ok) {
            res = fallbackRes;
            modelUsed = fallbackModel;
            isFallback = true;
          }
        } catch {
          // Keep original response
        }
      }

      if (!res.ok) {
        throw this.transformHttpError(res.status, errText, res.headers);
      }
    }

    interface GeminiResponsePayload {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }

    let data: GeminiResponsePayload;
    try {
      data = (await res.json()) as GeminiResponsePayload;
    } catch {
      throw new MalformedResponseError("Failed to parse JSON response from Gemini API.", {
        provider: "GEMINI",
        model: modelUsed,
      });
    }

    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0];
    const text = textPart?.text;

    if (typeof text !== "string") {
      throw new MalformedResponseError("Gemini response did not contain text content.", {
        provider: "GEMINI",
        model: modelUsed,
      });
    }

    const promptTokens = Number(data.usageMetadata?.promptTokenCount) || 0;
    const completionTokens = Number(data.usageMetadata?.candidatesTokenCount) || 0;
    const totalTokens = Number(data.usageMetadata?.totalTokenCount) || promptTokens + completionTokens;

    const durationMs = Date.now() - start;

    return {
      text,
      provider: "GEMINI",
      model: modelUsed,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: null,
      },
      durationMs,
      isFallback,
    };
  }

  private transformHttpError(status: number, errBody: string, headers: Headers): AiError {
    let parsedMessage = "";
    let googleStatus = "";
    try {
      const json = JSON.parse(errBody);
      parsedMessage = json.error?.message || "";
      googleStatus = json.error?.status || "";
    } catch {
      parsedMessage = errBody.slice(0, 200);
    }

    const cleanMsg = sanitizeErrorMessage(parsedMessage || `HTTP ${status}`);

    if (status === 400 && (googleStatus === "INVALID_ARGUMENT" || /API_KEY_INVALID/i.test(cleanMsg))) {
      return new InvalidApiKeyError(`Invalid Gemini API key: ${cleanMsg}`, {
        provider: "GEMINI",
        model: this.model,
        statusCode: 400,
      });
    }

    if (status === 401 || googleStatus === "UNAUTHENTICATED") {
      return new InvalidApiKeyError(`Gemini authentication failed: ${cleanMsg}`, {
        provider: "GEMINI",
        model: this.model,
        statusCode: 401,
      });
    }

    if (status === 403 || googleStatus === "PERMISSION_DENIED") {
      return new PermissionDeniedError(`Gemini permission denied: ${cleanMsg}`, {
        provider: "GEMINI",
        model: this.model,
        statusCode: 403,
      });
    }

    if (status === 404 || googleStatus === "NOT_FOUND") {
      return new ModelNotFoundError(`Gemini model not found: ${cleanMsg}`, {
        provider: "GEMINI",
        model: this.model,
        statusCode: 404,
      });
    }

    if (status === 429 || googleStatus === "RESOURCE_EXHAUSTED") {
      if (/quota|credit|billing/i.test(cleanMsg)) {
        return new QuotaExhaustedError(`Gemini quota exhausted: ${cleanMsg}`, {
          provider: "GEMINI",
          model: this.model,
        });
      }

      const retryAfter = headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      return new RateLimitError(`Gemini rate limit exceeded: ${cleanMsg}`, retryAfterSeconds, {
        provider: "GEMINI",
        model: this.model,
      });
    }

    if (status >= 500) {
      return new ProviderUnavailableError(`Gemini service error (${status}): ${cleanMsg}`, {
        provider: "GEMINI",
        model: this.model,
        statusCode: status,
      });
    }

    return new AiError(`Gemini error (${status}): ${cleanMsg}`, {
      provider: "GEMINI",
      model: this.model,
      statusCode: status,
    });
  }

  private transformNetworkException(err: unknown, durationMs: number): AiError {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      return new NetworkTimeoutError(`Gemini request timed out after ${durationMs}ms.`, {
        provider: "GEMINI",
        model: this.model,
        cause: err,
      });
    }
    return new ProviderUnavailableError(`Gemini network failure: ${sanitizeErrorMessage(msg)}`, {
      provider: "GEMINI",
      model: this.model,
      cause: err,
    });
  }

  private mapHttpErrorToHealthResult(status: number, errText: string, latencyMs: number): ProviderHealthCheckResult {
    const err = this.transformHttpError(status, errText, new Headers());
    return {
      status: "DISCONNECTED",
      latencyMs,
      message: err.message,
      errorCategory: err.category,
      rawError: err.message,
    };
  }

  private mapNetworkErrorToHealthResult(err: unknown, latencyMs: number): ProviderHealthCheckResult {
    const errorObj = this.transformNetworkException(err, latencyMs);
    return {
      status: "DISCONNECTED",
      latencyMs,
      message: errorObj.message,
      errorCategory: errorObj.category,
      rawError: errorObj.message,
    };
  }
}
