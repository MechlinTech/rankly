import type {
  AiProviderAdapter,
  AiProviderType,
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
import { validateCustomEndpointUrl } from "../ssrf";

const DEFAULT_ENDPOINTS: Partial<Record<AiProviderType, string>> = {
  OPENAI: "https://api.openai.com/v1",
  XAI: "https://api.x.ai/v1",
};

export interface OpenAiCompatibleOptions {
  providerType: AiProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

export class OpenAiCompatibleAdapter implements AiProviderAdapter {
  readonly providerType: AiProviderType;
  readonly model: string;
  readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.providerType = options.providerType;
    this.apiKey = options.apiKey?.trim();
    this.model = options.model?.trim();

    if (!this.apiKey) {
      throw new InvalidApiKeyError(`API key is required for ${options.providerType}.`);
    }

    if (!this.model) {
      throw new ModelNotFoundError(`Model identifier is required for ${options.providerType}.`);
    }

    if (options.baseUrl?.trim()) {
      const validated = validateCustomEndpointUrl(options.baseUrl.trim());
      // Strip trailing slashes
      this.baseUrl = validated.toString().replace(/\/+$/, "");
    } else if (DEFAULT_ENDPOINTS[options.providerType]) {
      this.baseUrl = DEFAULT_ENDPOINTS[options.providerType]!;
    } else {
      throw new AiError(`A valid baseUrl is required for ${options.providerType}.`, {
        provider: options.providerType,
        category: "CONFIGURATION_ERROR",
      });
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Rankly-AI-Engine/1.0",
    };
  }

  async testConnection(timeoutMs = 10000): Promise<ProviderHealthCheckResult> {
    const start = Date.now();
    try {
      // Step 1: Try low-cost GET /models first
      const modelsUrl = `${this.baseUrl}/models`;
      const res = await fetch(modelsUrl, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error", // Prevent redirect credential leakage
      });

      const latencyMs = Date.now() - start;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const rawList = Array.isArray(data.data) ? data.data : [];
        const modelIds: string[] = rawList
          .map((m: { id?: string }) => m.id)
          .filter((id: string | undefined): id is string => typeof id === "string");

        const foundConfiguredModel = modelIds.length === 0 || modelIds.includes(this.model);

        return {
          status: foundConfiguredModel ? "CONNECTED" : "DEGRADED",
          latencyMs,
          message: foundConfiguredModel
            ? `Successfully connected to ${this.providerType} (${modelIds.length} models discoverable).`
            : `Connected to ${this.providerType}, but configured model "${this.model}" was not in discoverable models list.`,
          availableModels: modelIds.slice(0, 50),
        };
      }

      // If /models returned 404 or 405 (some proxies or gateways disable /models),
      // try a minimal zero-token generation ping to verify credentials
      if (res.status === 404 || res.status === 405) {
        return await this.testViaMinimalGeneration(timeoutMs);
      }

      const errText = await res.text().catch(() => "");
      return this.mapHttpErrorToHealthResult(res.status, errText, latencyMs);
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      return this.mapNetworkErrorToHealthResult(err, latencyMs);
    }
  }

  private async testViaMinimalGeneration(timeoutMs: number): Promise<ProviderHealthCheckResult> {
    const start = Date.now();
    try {
      const url = `${this.baseUrl}/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return {
          status: "CONNECTED",
          latencyMs,
          message: `Successfully connected to ${this.providerType} via diagnostic completion ping.`,
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
      const res = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });

      if (!res.ok) return [];
      const data = await res.json().catch(() => ({}));
      if (!Array.isArray(data.data)) return [];
      return data.data
        .map((m: { id?: string }) => m.id)
        .filter((id: string | undefined): id is string => typeof id === "string");
    } catch {
      return [];
    }
  }

  async generateText(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? 30000;
    const url = `${this.baseUrl}/chat/completions`;

    const modelToUse = req.model ?? this.model;

    const payload: Record<string, unknown> = {
      model: modelToUse,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
      })),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    };

    if (req.responseFormat === "json_object") {
      payload.response_format = { type: "json_object" };
    }

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // If user supplied an abort signal, pipe it
      if (req.abortSignal) {
        req.abortSignal.addEventListener("abort", () => controller.abort());
      }

      res = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: "error",
      });

      clearTimeout(timer);
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      throw this.transformNetworkException(err, durationMs);
    }

    const durationMs = Date.now() - start;

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw this.transformHttpError(res.status, errorText, res.headers);
    }

    interface OpenAiResponsePayload {
      choices?: Array<{
        message?: { content?: string };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }

    let data: OpenAiResponsePayload;
    try {
      data = (await res.json()) as OpenAiResponsePayload;
    } catch {
      throw new MalformedResponseError("Failed to parse JSON response from AI provider.", {
        provider: this.providerType,
        model: modelToUse,
      });
    }

    const choice = data.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== "string") {
      throw new MalformedResponseError("Response choices array was empty or text content was missing.", {
        provider: this.providerType,
        model: modelToUse,
      });
    }

    const promptTokens = Number(data.usage?.prompt_tokens) || 0;
    const completionTokens = Number(data.usage?.completion_tokens) || 0;
    const totalTokens = Number(data.usage?.total_tokens) || promptTokens + completionTokens;

    return {
      text,
      provider: this.providerType,
      model: modelToUse,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: null,
      },
      durationMs,
      isFallback: false,
    };
  }

  private transformHttpError(status: number, errBody: string, headers: Headers): AiError {
    let parsedMessage = "";
    try {
      const json = JSON.parse(errBody);
      parsedMessage = json.error?.message || json.message || "";
    } catch {
      parsedMessage = errBody.slice(0, 200);
    }

    const cleanMsg = sanitizeErrorMessage(parsedMessage || `HTTP status ${status}`);

    if (status === 401) {
      return new InvalidApiKeyError(`Invalid API key: ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: 401,
      });
    }

    if (status === 403) {
      return new PermissionDeniedError(`Forbidden: ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: 403,
      });
    }

    if (status === 404) {
      return new ModelNotFoundError(`Model not found or unavailable: ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: 404,
      });
    }

    if (status === 429) {
      if (/quota|credit|billing|exceeded your current/i.test(cleanMsg)) {
        return new QuotaExhaustedError(`Provider quota exhausted: ${cleanMsg}`, {
          provider: this.providerType,
          model: this.model,
        });
      }

      const retryAfterHeader = headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      return new RateLimitError(`Rate limit exceeded: ${cleanMsg}`, retryAfterSeconds, {
        provider: this.providerType,
        model: this.model,
      });
    }

    if (status >= 500) {
      return new ProviderUnavailableError(`Provider service error (${status}): ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: status,
      });
    }

    return new AiError(`Provider request failed (${status}): ${cleanMsg}`, {
      provider: this.providerType,
      model: this.model,
      statusCode: status,
      category: "UNKNOWN_ERROR",
    });
  }

  private transformNetworkException(err: unknown, durationMs: number): AiError {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      return new NetworkTimeoutError(`Connection timed out after ${durationMs}ms.`, {
        provider: this.providerType,
        model: this.model,
        cause: err,
      });
    }
    return new ProviderUnavailableError(`Network connection failure: ${sanitizeErrorMessage(msg)}`, {
      provider: this.providerType,
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
