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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
}

export class AnthropicAdapter implements AiProviderAdapter {
  readonly providerType = "ANTHROPIC" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(options: AnthropicAdapterOptions) {
    this.apiKey = options.apiKey?.trim();
    this.model = options.model?.trim() || "claude-sonnet-5-5";

    if (!this.apiKey) {
      throw new InvalidApiKeyError("API key is required for Anthropic Claude.");
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "user-agent": "Rankly-AI-Engine/1.0",
    };
  }

  async testConnection(timeoutMs = 10000): Promise<ProviderHealthCheckResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${ANTHROPIC_API_URL}/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const modelsList = Array.isArray(data.data) ? data.data : [];
        const modelIds: string[] = modelsList
          .map((m: { id?: string }) => m.id)
          .filter((id: string | undefined): id is string => typeof id === "string");

        return {
          status: "CONNECTED",
          latencyMs,
          message: `Anthropic Claude API connected (${modelIds.length} model${modelIds.length === 1 ? "" : "s"} available).`,
          availableModels: modelIds,
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
      const res = await fetch(`${ANTHROPIC_API_URL}/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
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
    const modelToUse = req.model ?? this.model;

    // Anthropic extracts top-level 'system' string rather than 'system' role inside messages
    const systemMessages = req.messages.filter((m) => m.role === "system");
    const systemPrompt = systemMessages.map((m) => m.content).join("\n\n").trim();

    // Anthropic messages must only have role 'user' or 'assistant'
    const nonSystem = req.messages.filter((m) => m.role !== "system");
    const anthropicMessages = nonSystem.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Anthropic requires at least 1 message and the first must be 'user'
    if (anthropicMessages.length === 0) {
      anthropicMessages.push({ role: "user", content: "Hello" });
    }

    const payload: Record<string, unknown> = {
      model: modelToUse,
      messages: anthropicMessages,
      max_tokens: req.maxTokens ?? 1024,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      if (req.abortSignal) {
        req.abortSignal.addEventListener("abort", () => controller.abort());
      }

      res = await fetch(`${ANTHROPIC_API_URL}/messages`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      throw this.transformNetworkException(err, durationMs);
    }

    const durationMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw this.transformHttpError(res.status, errText, res.headers);
    }

    interface AnthropicResponsePayload {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }

    let data: AnthropicResponsePayload;
    try {
      data = (await res.json()) as AnthropicResponsePayload;
    } catch {
      throw new MalformedResponseError("Failed to parse JSON response from Anthropic Claude API.", {
        provider: "ANTHROPIC",
        model: modelToUse,
      });
    }

    // Anthropic returns content: [{ type: "text", text: "..." }]
    const textPart = data.content?.find((part: { type?: string; text?: string }) => part.type === "text");
    const text = textPart?.text ?? "";

    if (!text && data.stop_reason !== "max_tokens") {
      throw new MalformedResponseError("Anthropic response contained no text content.", {
        provider: "ANTHROPIC",
        model: modelToUse,
      });
    }

    const promptTokens = Number(data.usage?.input_tokens) || 0;
    const completionTokens = Number(data.usage?.output_tokens) || 0;
    const totalTokens = promptTokens + completionTokens;

    return {
      text,
      provider: "ANTHROPIC",
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

    const cleanMsg = sanitizeErrorMessage(parsedMessage || `HTTP ${status}`);

    if (status === 401) {
      return new InvalidApiKeyError(`Anthropic authentication failed: ${cleanMsg}`, {
        provider: "ANTHROPIC",
        model: this.model,
        statusCode: 401,
      });
    }

    if (status === 403) {
      return new PermissionDeniedError(`Anthropic permission denied: ${cleanMsg}`, {
        provider: "ANTHROPIC",
        model: this.model,
        statusCode: 403,
      });
    }

    if (status === 404) {
      return new ModelNotFoundError(`Anthropic model not found: ${cleanMsg}`, {
        provider: "ANTHROPIC",
        model: this.model,
        statusCode: 404,
      });
    }

    if (status === 429) {
      if (/credit|balance|quota/i.test(cleanMsg)) {
        return new QuotaExhaustedError(`Anthropic credits exhausted: ${cleanMsg}`, {
          provider: "ANTHROPIC",
          model: this.model,
        });
      }

      const retryAfter = headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      return new RateLimitError(`Anthropic rate limit exceeded: ${cleanMsg}`, retryAfterSeconds, {
        provider: "ANTHROPIC",
        model: this.model,
      });
    }

    if (status >= 500) {
      return new ProviderUnavailableError(`Anthropic server error (${status}): ${cleanMsg}`, {
        provider: "ANTHROPIC",
        model: this.model,
        statusCode: status,
      });
    }

    return new AiError(`Anthropic error (${status}): ${cleanMsg}`, {
      provider: "ANTHROPIC",
      model: this.model,
      statusCode: status,
    });
  }

  private transformNetworkException(err: unknown, durationMs: number): AiError {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      return new NetworkTimeoutError(`Anthropic request timed out after ${durationMs}ms.`, {
        provider: "ANTHROPIC",
        model: this.model,
        cause: err,
      });
    }
    return new ProviderUnavailableError(`Anthropic network failure: ${sanitizeErrorMessage(msg)}`, {
      provider: "ANTHROPIC",
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
