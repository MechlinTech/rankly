import type { AiProviderAdapter, AiProviderType } from "./types";
import { OpenAiCompatibleAdapter } from "./adapters/openai-compatible";
import { AnthropicAdapter } from "./adapters/anthropic";
import { GeminiAdapter } from "./adapters/gemini";
import { AiError } from "./errors";

export interface CreateAdapterParams {
  providerType: AiProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

/**
 * Creates an instantiated AiProviderAdapter for the given provider type and configuration.
 */
export function createAiAdapter(params: CreateAdapterParams): AiProviderAdapter {
  const { providerType, apiKey, model, baseUrl } = params;

  switch (providerType) {
    case "OPENAI":
    case "XAI":
    case "OPENAI_COMPATIBLE":
      return new OpenAiCompatibleAdapter({
        providerType,
        apiKey,
        model,
        baseUrl,
      });

    case "ANTHROPIC":
      return new AnthropicAdapter({
        apiKey,
        model,
      });

    case "GEMINI":
      return new GeminiAdapter({
        apiKey,
        model,
      });

    default: {
      const exhaustiveCheck: never = providerType;
      throw new AiError(`Unsupported AI provider type: ${String(exhaustiveCheck)}`, {
        category: "CONFIGURATION_ERROR",
      });
    }
  }
}
