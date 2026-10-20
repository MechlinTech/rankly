import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAiCompatibleAdapter } from "./adapters/openai-compatible";
import { AnthropicAdapter } from "./adapters/anthropic";
import { GeminiAdapter } from "./adapters/gemini";
import {
  InvalidApiKeyError,
  RateLimitError,
  QuotaExhaustedError,
} from "./errors";

describe("AI Provider Adapters", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("OpenAI-Compatible Adapter", () => {
    it("sends correct headers and handles successful text generation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Hello from OpenAI" } }],
          usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
        }),
      });

      const adapter = new OpenAiCompatibleAdapter({
        providerType: "OPENAI",
        apiKey: "sk-proj-testkey123456789",
        model: "gpt-4o-mini",
      });

      const res = await adapter.generateText({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(res.text).toBe("Hello from OpenAI");
      expect(res.provider).toBe("OPENAI");
      expect(res.model).toBe("gpt-4o-mini");
      expect(res.usage.promptTokens).toBe(15);
      expect(res.usage.completionTokens).toBe(5);
      expect(res.usage.totalTokens).toBe(20);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-proj-testkey123456789",
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("maps 401 to InvalidApiKeyError", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: "Incorrect API key provided" } }),
        headers: new Headers(),
      });

      const adapter = new OpenAiCompatibleAdapter({
        providerType: "OPENAI",
        apiKey: "bad-key",
        model: "gpt-4o-mini",
      });

      await expect(
        adapter.generateText({ messages: [{ role: "user", content: "test" }] })
      ).rejects.toThrow(InvalidApiKeyError);
    });

    it("maps 429 quota exhaustion to QuotaExhaustedError", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "You exceeded your current quota" } }),
        headers: new Headers(),
      });

      const adapter = new OpenAiCompatibleAdapter({
        providerType: "OPENAI",
        apiKey: "key",
        model: "gpt-4o-mini",
      });

      await expect(
        adapter.generateText({ messages: [{ role: "user", content: "test" }] })
      ).rejects.toThrow(QuotaExhaustedError);
    });

    it("maps 429 rate limit to RateLimitError with retryAfterSeconds", async () => {
      const headers = new Headers();
      headers.set("retry-after", "12");

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "Rate limit reached for requests" } }),
        headers,
      });

      const adapter = new OpenAiCompatibleAdapter({
        providerType: "OPENAI",
        apiKey: "key",
        model: "gpt-4o-mini",
      });

      await expect(
        adapter.generateText({ messages: [{ role: "user", content: "test" }] })
      ).rejects.toThrow(RateLimitError);
    });

    it("tests connection via /models successfully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }],
        }),
      });

      const adapter = new OpenAiCompatibleAdapter({
        providerType: "OPENAI",
        apiKey: "sk-proj-test",
        model: "gpt-4o-mini",
      });

      const health = await adapter.testConnection();
      expect(health.status).toBe("CONNECTED");
      expect(health.availableModels).toContain("gpt-4o-mini");
    });
  });

  describe("Anthropic Claude Adapter", () => {
    it("extracts system prompt to top-level and alternates user/assistant messages", async () => {
      let capturedBody: { system?: string; messages?: Array<{ role: string; content: string }>; max_tokens?: number } | null = null;

      globalThis.fetch = vi.fn().mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: "Claude response" }],
            usage: { input_tokens: 25, output_tokens: 10 },
          }),
        };
      });

      const adapter = new AnthropicAdapter({
        apiKey: "sk-ant-api03-abcdef1234567890",
        model: "claude-3-5-haiku-20241022",
      });

      const res = await adapter.generateText({
        messages: [
          { role: "system", content: "You are an SEO expert." },
          { role: "user", content: "Analyze keywords." },
        ],
      });

      expect(res.text).toBe("Claude response");
      expect(res.provider).toBe("ANTHROPIC");
      expect(res.usage.promptTokens).toBe(25);
      expect(res.usage.completionTokens).toBe(10);
      expect(res.usage.totalTokens).toBe(35);

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.system).toBe("You are an SEO expert.");
      expect(capturedBody!.messages).toEqual([{ role: "user", content: "Analyze keywords." }]);
      expect(capturedBody!.max_tokens).toBe(1024);
    });

    it("sends required anthropic-version and x-api-key headers", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "OK" }],
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      });

      const adapter = new AnthropicAdapter({
        apiKey: "sk-ant-test",
        model: "claude-3-5-haiku-20241022",
      });

      await adapter.generateText({ messages: [{ role: "user", content: "hi" }] });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test",
            "anthropic-version": "2023-06-01",
          }),
        })
      );
    });
  });

  describe("Google Gemini Adapter", () => {
    it("transforms messages to contents with role 'user' or 'model' and maps usage", async () => {
      let capturedBody: { systemInstruction?: { parts?: Array<{ text?: string }> }; contents?: Array<{ role: string; parts: Array<{ text: string }> }> } | null = null;

      globalThis.fetch = vi.fn().mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: "Gemini response text" }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 12,
              candidatesTokenCount: 8,
              totalTokenCount: 20,
            },
          }),
        };
      });

      const adapter = new GeminiAdapter({
        apiKey: "AIzaSyD1234567890abcdef",
        model: "gemini-1.5-flash",
      });

      const res = await adapter.generateText({
        messages: [
          { role: "system", content: "System instructions" },
          { role: "user", content: "What is Rankly?" },
          { role: "assistant", content: "Rankly is an SEO platform." },
          { role: "user", content: "Tell me more." },
        ],
      });

      expect(res.text).toBe("Gemini response text");
      expect(res.provider).toBe("GEMINI");
      expect(res.usage.promptTokens).toBe(12);
      expect(res.usage.completionTokens).toBe(8);
      expect(res.usage.totalTokens).toBe(20);

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.systemInstruction).toEqual({
        parts: [{ text: "System instructions" }],
      });
      expect(capturedBody!.contents).toEqual([
        { role: "user", parts: [{ text: "What is Rankly?" }] },
        { role: "model", parts: [{ text: "Rankly is an SEO platform." }] },
        { role: "user", parts: [{ text: "Tell me more." }] },
      ]);
    });

    it("sends x-goog-api-key header and strips models/ prefix from endpoint", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "OK" }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      });

      const adapter = new GeminiAdapter({
        apiKey: "AIzaSyTest",
        model: "models/gemini-1.5-flash",
      });

      await adapter.generateText({ messages: [{ role: "user", content: "ping" }] });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-goog-api-key": "AIzaSyTest",
          }),
        })
      );
    });

    it("maps 400 INVALID_ARGUMENT key error to InvalidApiKeyError", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              code: 400,
              message: "API_KEY_INVALID",
              status: "INVALID_ARGUMENT",
            },
          }),
        headers: new Headers(),
      });

      const adapter = new GeminiAdapter({
        apiKey: "bad-gemini-key",
        model: "gemini-1.5-flash",
      });

      await expect(
        adapter.generateText({ messages: [{ role: "user", content: "test" }] })
      ).rejects.toThrow(InvalidApiKeyError);
    });
  });
});
