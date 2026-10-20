import { describe, it, expect, vi } from "vitest";
import { estimateCostUsd, recordAiActivity } from "./usage";
import { prisma } from "@/lib/db";

describe("AI Token & Usage Tracking Module", () => {
  it("calculates accurate estimated cost for known OpenAI models", () => {
    // gpt-4o-mini: $0.15/1M input, $0.60/1M output
    // 1000 input, 1000 output -> $0.00015 + $0.0006 = $0.00075
    const cost = estimateCostUsd("gpt-4o-mini", 1000, 1000);
    expect(cost).toBe(0.00075);
  });

  it("calculates accurate estimated cost for Anthropic Claude models", () => {
    // claude-3-5-haiku-20241022: $0.80/1M input, $4.00/1M output
    // 10,000 input, 2,000 output -> (10000/10^6)*0.8 + (2000/10^6)*4.0 = 0.008 + 0.008 = 0.016
    const cost = estimateCostUsd("claude-3-5-haiku-20241022", 10000, 2000);
    expect(cost).toBe(0.016);
  });

  it("calculates accurate estimated cost for Google Gemini models", () => {
    // gemini-1.5-flash: $0.075/1M input, $0.30/1M output
    // 10,000 input, 10,000 output -> 0.00075 + 0.003 = 0.00375
    const cost = estimateCostUsd("gemini-1.5-flash", 10000, 10000);
    expect(cost).toBe(0.00375);
  });

  it("handles models with 'models/' prefix correctly", () => {
    const cost = estimateCostUsd("models/gemini-1.5-flash", 10000, 10000);
    expect(cost).toBe(0.00375);
  });

  it("returns null for unknown or custom endpoint models", () => {
    expect(estimateCostUsd("custom-llama-3", 1000, 1000)).toBeNull();
    expect(estimateCostUsd("unknown-provider-model", 500, 500)).toBeNull();
  });

  it("safely attempts to persist activity log without throwing when database is unavailable", async () => {
    // Mock prisma.aiActivityLog.create to throw
    vi.spyOn(prisma.aiActivityLog, "create").mockRejectedValueOnce(new Error("Database disconnected"));

    // Should not throw
    await expect(
      recordAiActivity({
        feature: "test-feature",
        provider: "OPENAI",
        model: "gpt-4o-mini",
        promptTokens: 100,
        completionTokens: 50,
      })
    ).resolves.not.toThrow();
  });
});
