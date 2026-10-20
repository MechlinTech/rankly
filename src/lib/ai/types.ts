/**
 * Core types and interfaces for Rankly's multi-provider AI engine.
 */

export type AiProviderType =
  | "OPENAI"
  | "ANTHROPIC"
  | "GEMINI"
  | "XAI"
  | "OPENAI_COMPATIBLE";

export type AiHealthStatus =
  | "CONNECTED"
  | "DEGRADED"
  | "DISCONNECTED"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export interface ModelCapability {
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number | null;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  responseFormat?: "text" | "json_object";
  feature?: string;
  tenantId?: string;
  userId?: string;
  allowFallback?: boolean;
}

export interface CompletionResponse {
  text: string;
  provider: AiProviderType;
  model: string;
  usage: TokenUsage;
  durationMs: number;
  isFallback: boolean;
  fallbackDetails?: {
    attemptedProviders: string[];
    originalError: string;
  };
}

export interface ProviderHealthCheckResult {
  status: AiHealthStatus;
  latencyMs: number;
  message: string;
  availableModels?: string[];
  errorCategory?: string;
  rawError?: string;
  connectionTest?: {
    success: boolean;
    message: string;
    latencyMs?: number;
  };
  operationalCheck?: {
    success: boolean;
    status: "OPERATIONAL" | "QUOTA_EXHAUSTED" | "MODEL_NOT_FOUND" | "RATE_LIMITED" | "FAILED";
    message: string;
    latencyMs?: number;
  };
}

export interface AiProviderAdapter {
  readonly providerType: AiProviderType;
  readonly model: string;
  testConnection(timeoutMs?: number): Promise<ProviderHealthCheckResult>;
  generateText(req: CompletionRequest): Promise<CompletionResponse>;
  listModels?(): Promise<string[]>;
}

export interface SafeAiProviderConfig {
  id: string;
  providerType: AiProviderType;
  displayName: string;
  maskedApiKey: string;
  baseUrl: string | null;
  defaultModel: string;
  isActive: boolean;
  isDefault: boolean;
  isFallback: boolean;
  fallbackPriority: number;
  healthStatus: AiHealthStatus;
  lastHealthCheck: string | null;
  lastSuccessfulCheck: string | null;
  lastLatencyMs: number | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderModelOption {
  id: string;
  name: string;
  description?: string;
  recommended?: boolean;
}

export const KNOWN_MODELS: Record<AiProviderType, ProviderModelOption[]> = {
  OPENAI: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast, cost-efficient standard production model (Recommended)", recommended: true },
    { id: "gpt-4o", name: "GPT-4o", description: "Flagship multimodal intelligence & high accuracy" },
    { id: "o3-mini", name: "o3-mini", description: "Advanced reasoning, math, and code generation" },
    { id: "gpt-6-astra", name: "GPT-6 Astra", description: "Frontier versatile intelligence & multimodal reasoning" },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", description: "Advanced high-precision deliberative reasoning" },
    { id: "gpt-oss-120b", name: "GPT-OSS 120B", description: "High-throughput open architecture endpoint" },
  ],
  ANTHROPIC: [
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", description: "Flagship hybrid reasoning & thinking model (Recommended)", recommended: true },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "High-speed reasoning, coding & agentic workflows" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Ultra-fast response latency & high efficiency" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", description: "Next-gen frontier reasoning & agentic execution" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", description: "Ultra-fast response latency & high efficiency" },
  ],
  GEMINI: [
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", description: "High-speed, verified production model with massive context (Recommended)", recommended: true },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", description: "Ultra-low latency lightweight generation" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", description: "Next-gen multimodal reasoning" },
    { id: "gemini-4-argon", name: "Gemini 4 Argon", description: "Frontier deep reasoning & complex problem solving" },
    { id: "gemini-omni-1.1-flash", name: "Gemini Omni 1.1 Flash", description: "Real-time conversational multimodal stream" },
  ],
  XAI: [
    { id: "grok-2-latest", name: "Grok 2 Latest", description: "High-performance reasoning & real-time search (Recommended)", recommended: true },
    { id: "grok-4.7", name: "Grok 4.7", description: "Frontier real-time reasoning & web context" },
  ],
  OPENAI_COMPATIBLE: [
    { id: "deepseek-chat", name: "DeepSeek V3", description: "High-efficiency general chat & coding (Recommended)", recommended: true },
    { id: "deepseek-reasoner", name: "DeepSeek R1", description: "Open reasoning model with chain-of-thought" },
    { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", description: "Open-source flagship (vLLM / Together AI / Ollama)" },
    { id: "mistral-large-latest", name: "Mistral Large", description: "Frontier reasoning via Mistral AI or gateway" },
  ],
};

export const DEFAULT_MODELS: Record<AiProviderType, string> = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-3-7-sonnet-20250219",
  GEMINI: "gemini-3.5-flash",
  XAI: "grok-2-latest",
  OPENAI_COMPATIBLE: "deepseek-chat",
};
