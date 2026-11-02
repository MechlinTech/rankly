import type {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  ProviderHealthCheckResult,
} from "../types";
import {
  AiError,
  InvalidApiKeyError,
  ModelNotFoundError,
  RateLimitError,
  NetworkTimeoutError,
  ProviderUnavailableError,
  MalformedResponseError,
  sanitizeErrorMessage,
} from "../errors";
import { validateCustomEndpointUrl } from "../ssrf";
import { DEFAULT_OLLAMA_URL } from "../types";

export interface OllamaOptions {
  apiKey?: string | null;
  model: string;
  baseUrl?: string | null;
}

export class OllamaAdapter implements AiProviderAdapter {
  readonly providerType = "OLLAMA" as const;
  readonly model: string;
  readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: OllamaOptions) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.model = options.model?.trim() || "qwen2.5-coder:7b";

    const rawUrl = options.baseUrl?.trim() || DEFAULT_OLLAMA_URL;
    const validated = validateCustomEndpointUrl(rawUrl);
    // Strip trailing slashes and normalize (if path ends with /v1 or /api, strip to base root)
    let cleaned = validated.toString().replace(/\/+$/, "");
    if (cleaned.endsWith("/v1") || cleaned.endsWith("/api")) {
      cleaned = cleaned.replace(/\/(v1|api)$/, "");
    }
    this.baseUrl = cleaned;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Rankly-AI-Engine/1.0 (Ollama-Client)",
    };
    if (this.apiKey && this.apiKey !== "ollama" && this.apiKey !== "none") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async testConnection(timeoutMs = 10000): Promise<ProviderHealthCheckResult> {
    const start = Date.now();
    try {
      // 1. Query Ollama /api/tags
      const tagsUrl = `${this.baseUrl}/api/tags`;
      let res = await fetch(tagsUrl, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      }).catch(() => null);

      let modelIds: string[] = [];

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.models)) {
          modelIds = data.models
            .map((m: { name?: string; model?: string }) => m.name || m.model)
            .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
        }
      } else {
        // Fallback: try /v1/models (OpenAI compatibility endpoint)
        const modelsUrl = `${this.baseUrl}/v1/models`;
        res = await fetch(modelsUrl, {
          method: "GET",
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        }).catch(() => null);

        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          const list = Array.isArray(data.data) ? data.data : [];
          modelIds = list
            .map((m: { id?: string }) => m.id)
            .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
        }
      }

      const latencyMs = Date.now() - start;

      if (res && res.ok) {
        // Check if configured model exists in discoverable models
        const normalizedTarget = this.model.toLowerCase();
        const found =
          modelIds.length === 0 ||
          modelIds.some((m) => {
            const lower = m.toLowerCase();
            return (
              lower === normalizedTarget ||
              lower === `${normalizedTarget}:latest` ||
              `${lower}:latest` === normalizedTarget ||
              lower.startsWith(normalizedTarget.split(":")[0])
            );
          });

        return {
          status: found ? "CONNECTED" : "DEGRADED",
          latencyMs,
          message: found
            ? `Successfully connected to Ollama (${modelIds.length} model${modelIds.length === 1 ? "" : "s"} available).`
            : `Connected to Ollama, but model "${this.model}" was not found in downloaded models list.`,
          availableModels: modelIds.slice(0, 50),
        };
      }

      if (res) {
        const errText = await res.text().catch(() => "");
        return this.mapHttpErrorToHealthResult(res.status, errText, latencyMs);
      }

      throw new Error(`Failed to connect to Ollama server at ${this.baseUrl}`);
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      return this.mapNetworkErrorToHealthResult(err, latencyMs);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const tagsUrl = `${this.baseUrl}/api/tags`;
      const res = await fetch(tagsUrl, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.models)) {
          return data.models
            .map((m: { name?: string; model?: string }) => m.name || m.model)
            .filter((n: unknown): n is string => typeof n === "string");
        }
      }

      // Fallback: /v1/models
      const v1Res = await fetch(`${this.baseUrl}/v1/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });

      if (v1Res.ok) {
        const data = await v1Res.json().catch(() => ({}));
        if (Array.isArray(data.data)) {
          return data.data
            .map((m: { id?: string }) => m.id)
            .filter((id: unknown): id is string => typeof id === "string");
        }
      }

      return [];
    } catch {
      return [];
    }
  }

  async generateText(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? 45000;
    const modelToUse = req.model ?? this.model;

    // First attempt: Native Ollama /api/chat
    const chatUrl = `${this.baseUrl}/api/chat`;
    const payload: Record<string, unknown> = {
      model: modelToUse,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { num_predict: req.maxTokens } : {}),
      },
    };

    if (req.responseFormat === "json_object") {
      payload.format = "json";
    }

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      if (req.abortSignal) {
        req.abortSignal.addEventListener("abort", () => controller.abort());
      }

      res = await fetch(chatUrl, {
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
      // If /api/chat returned 404, try /v1/chat/completions (OpenAI compatible endpoint)
      if (res.status === 404) {
        return this.generateViaV1Completions(req, modelToUse, start, timeoutMs);
      }
      const errorText = await res.text().catch(() => "");
      throw this.transformHttpError(res.status, errorText);
    }

    interface OllamaChatResponse {
      model?: string;
      message?: { role?: string; content?: string };
      total_duration?: number;
      prompt_eval_count?: number;
      eval_count?: number;
      error?: string;
    }

    let data: OllamaChatResponse;
    try {
      data = (await res.json()) as OllamaChatResponse;
    } catch {
      throw new MalformedResponseError("Failed to parse JSON response from Ollama.", {
        provider: this.providerType,
        model: modelToUse,
      });
    }

    if (data.error) {
      throw new AiError(`Ollama error: ${data.error}`, {
        provider: this.providerType,
        model: modelToUse,
        category: "UNKNOWN_ERROR",
      });
    }

    const text = data.message?.content;
    if (typeof text !== "string") {
      throw new MalformedResponseError("Ollama response message content was missing or invalid.", {
        provider: this.providerType,
        model: modelToUse,
      });
    }

    const promptTokens = Number(data.prompt_eval_count) || 0;
    const completionTokens = Number(data.eval_count) || 0;
    const totalTokens = promptTokens + completionTokens;

    return {
      text,
      provider: this.providerType,
      model: modelToUse,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: 0, // Self-hosted
      },
      durationMs,
      isFallback: false,
    };
  }

  private async generateViaV1Completions(
    req: CompletionRequest,
    modelToUse: string,
    start: number,
    timeoutMs: number
  ): Promise<CompletionResponse> {
    const v1Url = `${this.baseUrl}/v1/chat/completions`;
    const payload: Record<string, unknown> = {
      model: modelToUse,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    };

    if (req.responseFormat === "json_object") {
      payload.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (req.abortSignal) {
      req.abortSignal.addEventListener("abort", () => controller.abort());
    }

    let res: Response;
    try {
      res = await fetch(v1Url, {
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
      const errText = await res.text().catch(() => "");
      throw this.transformHttpError(res.status, errText);
    }

    interface OpenAiCompatResponse {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }

    const data = (await res.json().catch(() => ({}))) as OpenAiCompatResponse;
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new MalformedResponseError("Response content was missing from /v1/chat/completions.", {
        provider: this.providerType,
        model: modelToUse,
      });
    }

    const promptTokens = Number(data.usage?.prompt_tokens) || 0;
    const completionTokens = Number(data.usage?.completion_tokens) || 0;

    return {
      text,
      provider: this.providerType,
      model: modelToUse,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostUsd: 0,
      },
      durationMs,
      isFallback: false,
    };
  }

  private transformHttpError(status: number, errBody: string): AiError {
    let parsedMessage = "";
    try {
      const json = JSON.parse(errBody);
      parsedMessage = json.error?.message || json.error || json.message || "";
    } catch {
      parsedMessage = errBody.slice(0, 200);
    }

    const cleanMsg = sanitizeErrorMessage(parsedMessage || `HTTP ${status}`);

    if (status === 401 || status === 403) {
      return new InvalidApiKeyError(`Authentication failed: ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: status,
      });
    }

    if (status === 404) {
      return new ModelNotFoundError(`Model not found or endpoint unavailable: ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: 404,
      });
    }

    if (status === 429) {
      return new RateLimitError(`Rate limited by Ollama server: ${cleanMsg}`, undefined, {
        provider: this.providerType,
        model: this.model,
      });
    }

    if (status >= 500) {
      return new ProviderUnavailableError(`Ollama server error (${status}): ${cleanMsg}`, {
        provider: this.providerType,
        model: this.model,
        statusCode: status,
      });
    }

    return new AiError(`Ollama request failed (${status}): ${cleanMsg}`, {
      provider: this.providerType,
      model: this.model,
      statusCode: status,
      category: "UNKNOWN_ERROR",
    });
  }

  private transformNetworkException(err: unknown, durationMs: number): AiError {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      return new NetworkTimeoutError(`Connection to Ollama timed out after ${durationMs}ms.`, {
        provider: this.providerType,
        model: this.model,
        cause: err,
      });
    }
    return new ProviderUnavailableError(`Failed to reach Ollama server: ${sanitizeErrorMessage(msg)}`, {
      provider: this.providerType,
      model: this.model,
      cause: err,
    });
  }

  private mapHttpErrorToHealthResult(status: number, errText: string, latencyMs: number): ProviderHealthCheckResult {
    const err = this.transformHttpError(status, errText);
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

