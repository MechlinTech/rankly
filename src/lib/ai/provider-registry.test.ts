import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isEligibleForFallback,
  executeAiCompletion,
  resolvePrimaryProvider,
} from "./provider-registry";
import {
  RateLimitError,
  QuotaExhaustedError,
  NetworkTimeoutError,
  ProviderUnavailableError,
  InvalidApiKeyError,
  SsrfBlockedError,
  NoProviderConfiguredError,
  FallbackExhaustedError,
} from "./errors";
import { encryptSecret } from "@/lib/crypto/encryption";
import { prisma } from "@/lib/db";
import type { AiProviderConfig } from "@/generated/prisma/client";

function mockConfig(overrides: Partial<AiProviderConfig>): AiProviderConfig {
  return {
    id: "mock-id",
    providerType: "OPENAI",
    displayName: "Mock Provider",
    encryptedApiKey: "mock-key",
    maskedApiKey: "mock••••key",
    baseUrl: null,
    defaultModel: "gpt-4o-mini",
    isActive: true,
    isDefault: false,
    isFallback: false,
    fallbackPriority: 0,
    healthStatus: "CONNECTED",
    lastHealthCheck: new Date(),
    lastSuccessfulCheck: new Date(),
    lastLatencyMs: 100,
    lastErrorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    updatedById: null,
    ...overrides,
  };
}

describe("AI Provider Registry & Fallback Orchestration", () => {
  const originalEnv = process.env.APP_ENCRYPTION_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEnv;
    if (originalAnthropicKey) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("isEligibleForFallback", () => {
    it("marks 429, 503, timeouts, and auth errors eligible for fallback", () => {
      expect(isEligibleForFallback(new RateLimitError())).toBe(true);
      expect(isEligibleForFallback(new QuotaExhaustedError())).toBe(true);
      expect(isEligibleForFallback(new NetworkTimeoutError())).toBe(true);
      expect(isEligibleForFallback(new ProviderUnavailableError())).toBe(true);
      expect(isEligibleForFallback(new InvalidApiKeyError())).toBe(true);
    });

    it("marks security violations and unexpected errors ineligible for fallback", () => {
      expect(isEligibleForFallback(new SsrfBlockedError())).toBe(false);
      expect(isEligibleForFallback(new Error("Generic client validation failed"))).toBe(false);
    });
  });

  describe("resolvePrimaryProvider with legacy environment variable", () => {
    it("falls back to legacy ANTHROPIC_API_KEY if no DB provider exists", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-legacy-key";
      vi.spyOn(prisma.aiProviderConfig, "findFirst").mockResolvedValue(null);

      const resolved = await resolvePrimaryProvider();
      expect(resolved.providerType).toBe("ANTHROPIC");
      expect(resolved.configId).toBe("legacy_anthropic");
    });

    it("throws NoProviderConfiguredError when no DB config and no legacy key exist", async () => {
      vi.spyOn(prisma.aiProviderConfig, "findFirst").mockResolvedValue(null);

      await expect(resolvePrimaryProvider()).rejects.toThrow(NoProviderConfiguredError);
    });
  });

  describe("End-to-End Fallback Orchestration", () => {
    it("completes via primary provider without invoking fallback", async () => {
      const encryptedKey = encryptSecret("sk-proj-primary-key");

      (vi.spyOn(prisma.aiProviderConfig, "findFirst") as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (args) => {
        if (args?.where?.isDefault) {
          return mockConfig({
            id: "prov-primary-1",
            providerType: "OPENAI",
            displayName: "Primary OpenAI",
            encryptedApiKey: encryptedKey,
            maskedApiKey: "sk-proj-••••••••key",
            defaultModel: "gpt-4o-mini",
            isDefault: true,
          });
        }
        return null;
      });

      // Mock OpenAI fetch success
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Primary answer" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const response = await executeAiCompletion({
        messages: [{ role: "user", content: "Test" }],
      });

      expect(response.text).toBe("Primary answer");
      expect(response.isFallback).toBe(false);
      expect(response.provider).toBe("OPENAI");
    });

    it("automatically fails over to secondary fallback provider on primary 429 rate limit", async () => {
      const primaryKey = encryptSecret("sk-proj-primary-key");
      const fallbackKey = encryptSecret("AIzaSy-fallback-key");

      (vi.spyOn(prisma.aiProviderConfig, "findFirst") as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (args) => {
        if (args?.where?.isDefault) {
          return mockConfig({
            id: "prov-primary",
            providerType: "OPENAI",
            displayName: "Primary OpenAI",
            encryptedApiKey: primaryKey,
            maskedApiKey: "sk-proj-••••••••key",
            defaultModel: "gpt-4o-mini",
            isDefault: true,
          });
        }

        if (args?.where?.isFallback) {
          return mockConfig({
            id: "prov-fallback",
            providerType: "GEMINI",
            displayName: "Fallback Gemini",
            encryptedApiKey: fallbackKey,
            maskedApiKey: "AIzaSy••••••••key",
            defaultModel: "gemini-1.5-flash",
            isDefault: false,
            isFallback: true,
            fallbackPriority: 10,
          });
        }

        return null;
      });

      // Mock fetch: First call (OpenAI) fails with 429, Second call (Gemini) succeeds
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: "Rate limit exceeded" } }),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "Gemini fallback response" }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          }),
        });

      const response = await executeAiCompletion({
        messages: [{ role: "user", content: "Test query" }],
        allowFallback: true,
      });

      expect(response.text).toBe("Gemini fallback response");
      expect(response.isFallback).toBe(true);
      expect(response.provider).toBe("GEMINI");
      expect(response.fallbackDetails?.attemptedProviders).toEqual(["OPENAI", "GEMINI"]);
      expect(response.fallbackDetails?.originalError).toContain("Rate limit");
    });

    it("throws FallbackExhaustedError when both primary and secondary fallback fail", async () => {
      const primaryKey = encryptSecret("sk-proj-primary-key");
      const fallbackKey = encryptSecret("AIzaSy-fallback-key");

      (vi.spyOn(prisma.aiProviderConfig, "findFirst") as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (args) => {
        if (args?.where?.isDefault) {
          return mockConfig({
            id: "prov-primary",
            providerType: "OPENAI",
            defaultModel: "gpt-4o-mini",
            encryptedApiKey: primaryKey,
            isDefault: true,
          });
        }
        if (args?.where?.isFallback) {
          return mockConfig({
            id: "prov-fallback",
            providerType: "GEMINI",
            defaultModel: "gemini-1.5-flash",
            encryptedApiKey: fallbackKey,
            isFallback: true,
          });
        }
        return null;
      });

      // Both fetch calls fail with 503
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "OpenAI Outage",
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Gemini Outage",
          headers: new Headers(),
        });

      await expect(
        executeAiCompletion({
          messages: [{ role: "user", content: "Test query" }],
          allowFallback: true,
        })
      ).rejects.toThrow(FallbackExhaustedError);
    });

    it("does not invoke fallback if allowFallback is false", async () => {
      const primaryKey = encryptSecret("sk-proj-primary-key");

      vi.spyOn(prisma.aiProviderConfig, "findFirst").mockResolvedValueOnce(
        mockConfig({
          id: "prov-primary",
          providerType: "OPENAI",
          defaultModel: "gpt-4o-mini",
          encryptedApiKey: primaryKey,
          isDefault: true,
        })
      );

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "Rate limit" } }),
        headers: new Headers(),
      });

      await expect(
        executeAiCompletion({
          messages: [{ role: "user", content: "Test" }],
          allowFallback: false,
        })
      ).rejects.toThrow(RateLimitError);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
