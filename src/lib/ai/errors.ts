import type { AiProviderType } from "./types";

export type AiErrorCategory =
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_DENIED"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMIT"
  | "QUOTA_EXHAUSTED"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MALFORMED_RESPONSE"
  | "SECURITY_VIOLATION"
  | "CONFIGURATION_ERROR"
  | "CAPABILITY_UNSUPPORTED"
  | "FALLBACK_EXHAUSTED"
  | "UNKNOWN_ERROR";

export interface AiErrorOptions {
  provider?: AiProviderType | string;
  model?: string;
  statusCode?: number;
  isRetryable?: boolean;
  category?: AiErrorCategory;
  cause?: unknown;
}

export class AiError extends Error {
  readonly provider?: AiProviderType | string;
  readonly model?: string;
  readonly statusCode?: number;
  readonly isRetryable: boolean;
  readonly category: AiErrorCategory;

  constructor(message: string, options: AiErrorOptions = {}) {
    super(sanitizeErrorMessage(message));
    this.name = "AiError";
    this.provider = options.provider;
    this.model = options.model;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.category = options.category ?? "UNKNOWN_ERROR";
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export class InvalidApiKeyError extends AiError {
  constructor(message = "Invalid or expired AI provider API key.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 401,
      isRetryable: false,
      category: "AUTHENTICATION_ERROR",
    });
    this.name = "InvalidApiKeyError";
  }
}

export class PermissionDeniedError extends AiError {
  constructor(message = "Access to the requested model or project is forbidden.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 403,
      isRetryable: false,
      category: "PERMISSION_DENIED",
    });
    this.name = "PermissionDeniedError";
  }
}

export class ModelNotFoundError extends AiError {
  constructor(message = "The specified AI model was not found or is unavailable for this account.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 404,
      isRetryable: false,
      category: "MODEL_NOT_FOUND",
    });
    this.name = "ModelNotFoundError";
  }
}

export class RateLimitError extends AiError {
  readonly retryAfterSeconds?: number;

  constructor(message = "Provider rate limit exceeded.", retryAfterSeconds?: number, options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 429,
      isRetryable: true,
      category: "RATE_LIMIT",
    });
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class QuotaExhaustedError extends AiError {
  constructor(message = "Provider billing quota or credits have been exhausted.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 429,
      isRetryable: false, // Not immediately retryable on same provider
      category: "QUOTA_EXHAUSTED",
    });
    this.name = "QuotaExhaustedError";
  }
}

export class NetworkTimeoutError extends AiError {
  constructor(message = "Connection to AI provider timed out.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 504,
      isRetryable: true,
      category: "TIMEOUT",
    });
    this.name = "NetworkTimeoutError";
  }
}

export class ProviderUnavailableError extends AiError {
  constructor(message = "AI provider service is temporarily unavailable (5xx error).", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 503,
      isRetryable: true,
      category: "PROVIDER_UNAVAILABLE",
    });
    this.name = "ProviderUnavailableError";
  }
}

export class MalformedResponseError extends AiError {
  constructor(message = "AI provider returned an unexpected or malformed response format.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: options.statusCode ?? 502,
      isRetryable: true,
      category: "MALFORMED_RESPONSE",
    });
    this.name = "MalformedResponseError";
  }
}

export class SsrfBlockedError extends AiError {
  constructor(message = "Destination address is restricted for security reasons (SSRF protection).", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: 400,
      isRetryable: false,
      category: "SECURITY_VIOLATION",
    });
    this.name = "SsrfBlockedError";
  }
}

export class NoProviderConfiguredError extends AiError {
  constructor(message = "No active AI provider is configured in the platform settings.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: 503,
      isRetryable: false,
      category: "CONFIGURATION_ERROR",
    });
    this.name = "NoProviderConfiguredError";
  }
}

export class FallbackExhaustedError extends AiError {
  constructor(message = "Primary and all configured fallback AI providers failed.", options: AiErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: 502,
      isRetryable: false,
      category: "FALLBACK_EXHAUSTED",
    });
    this.name = "FallbackExhaustedError";
  }
}

/**
 * Sanitizes an error message or string, redacting potential keys, tokens, or credentials.
 */
export function sanitizeErrorMessage(input: unknown): string {
  if (typeof input !== "string") {
    if (input instanceof Error) {
      input = input.message;
    } else {
      input = String(input ?? "");
    }
  }

  let text = input as string;

  // Redact Bearer tokens
  text = text.replace(/Bearer\s+([a-zA-Z0-9_\-\.]+)/gi, "Bearer [REDACTED]");

  // Redact Anthropic keys
  text = text.replace(/sk-ant-[a-zA-Z0-9_\-]+/gi, "sk-ant-[REDACTED]");

  // Redact OpenAI keys
  text = text.replace(/sk-(?:proj-)?[a-zA-Z0-9_\-]+/gi, "sk-[REDACTED]");

  // Redact Google AI Studio keys
  text = text.replace(/AIzaSy[a-zA-Z0-9_\-]+/gi, "AIzaSy[REDACTED]");

  // Redact xAI keys
  text = text.replace(/xai-[a-zA-Z0-9_\-]+/gi, "xai-[REDACTED]");

  // Redact URL credentials
  text = text.replace(/\/\/[^:]+:[^@]+@/g, "//[REDACTED_CREDENTIALS]@");

  return text.trim();
}
