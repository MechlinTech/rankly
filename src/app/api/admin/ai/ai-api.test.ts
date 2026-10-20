import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET as getProviders, POST as createProvider } from "./providers/route";
import { GET as getProviderById, PATCH as updateProvider, DELETE as deleteProvider } from "./providers/[id]/route";
import { POST as testProvider } from "./providers/test/route";
import { GET as getAiHealth } from "./health/route";
import * as authSuperAdmin from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto/encryption";
import type { AiProviderConfig, User, AuditLog } from "@/generated/prisma/client";

function mockAdminUser(): User {
  return {
    id: "admin-1",
    email: "admin@rankly.com",
    name: "Platform Admin",
    isSuperAdmin: true,
    passwordHash: "hash",
    emailVerified: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockProviderConfig(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    id: "p1",
    providerType: "GEMINI",
    displayName: "Google Gemini",
    encryptedApiKey: encryptSecret("AIzaSySecretKey1234"),
    maskedApiKey: "AIzaSy••••••••1234",
    baseUrl: null,
    defaultModel: "gemini-1.5-flash",
    isActive: true,
    isDefault: true,
    isFallback: false,
    fallbackPriority: 0,
    healthStatus: "CONNECTED",
    lastHealthCheck: new Date(),
    lastSuccessfulCheck: new Date(),
    lastLatencyMs: 150,
    lastErrorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: "admin-1",
    updatedById: "admin-1",
    ...overrides,
  };
}

describe("Super Admin AI Provider API Handlers", () => {
  const originalEnv = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEnv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthorized non-super-admin requests with 403", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: null,
      response: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    });

    const res = await getProviders();
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/ai/providers returns masked keys and never exposes encrypted or plaintext secrets", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "findMany").mockResolvedValueOnce([mockProviderConfig()]);

    const res = await getProviders();
    expect(res.status).toBe(200);

    const data = (await res.json()) as { providers: Array<Record<string, unknown>> };
    expect(data.providers.length).toBe(1);
    const provider = data.providers[0];

    expect(provider.maskedApiKey).toBe("AIzaSy••••••••1234");
    expect(provider.encryptedApiKey).toBeUndefined(); // MUST NOT leak to client
    expect(provider.apiKey).toBeUndefined();
  });

  it("GET /api/admin/ai/providers/[id] returns single safe provider", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "findUnique").mockResolvedValueOnce(mockProviderConfig({ id: "p1" }));

    const res = await getProviderById(new NextRequest("http://localhost/api/admin/ai/providers/p1"), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { provider: Record<string, unknown> };
    expect(data.provider.id).toBe("p1");
    expect(data.provider.encryptedApiKey).toBeUndefined();
  });

  it("POST /api/admin/ai/providers validates input and encrypts API key before saving", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    let savedData: Partial<AiProviderConfig> | null = null;
    vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback) => {
      const mockTx = {
        aiProviderConfig: {
          updateMany: vi.fn(),
          create: vi.fn().mockImplementation(async (args: { data: Partial<AiProviderConfig> }) => {
            savedData = args.data;
            return mockProviderConfig({
              id: "new-p1",
              ...args.data,
            });
          }),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return callback(mockTx as any);
    });

    vi.spyOn(prisma.auditLog, "create").mockResolvedValueOnce({} as AuditLog);

    const req = new NextRequest("http://localhost/api/admin/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        providerType: "OPENAI",
        displayName: "OpenAI GPT-4o",
        apiKey: "sk-proj-super-secret-1234567890",
        defaultModel: "gpt-4o-mini",
        isDefault: true,
      }),
    });

    const res = await createProvider(req);
    expect(res.status).toBe(201);

    expect(savedData).toBeDefined();
    expect(savedData!.encryptedApiKey!.startsWith("v1:")).toBe(true);
    expect(savedData!.maskedApiKey).toBe("sk-proj-••••••••7890");
    // Plaintext secret must never be stored in plaintext column
    expect(savedData!.encryptedApiKey).not.toContain("sk-proj-super-secret-1234567890");
  });

  it("PATCH /api/admin/ai/providers/[id] safely updates attributes and allows key replacement", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "findUnique").mockResolvedValueOnce(mockProviderConfig({ id: "p1" }));

    vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback) => {
      const mockTx = {
        aiProviderConfig: {
          updateMany: vi.fn(),
          update: vi.fn().mockImplementation(async (args: { data: Partial<AiProviderConfig> }) => {
            return mockProviderConfig({
              id: "p1",
              ...args.data,
            });
          }),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return callback(mockTx as any);
    });

    vi.spyOn(prisma.auditLog, "create").mockResolvedValueOnce({} as AuditLog);

    const req = new NextRequest("http://localhost/api/admin/ai/providers/p1", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: "Renamed Gemini",
        apiKey: "AIzaSyNewKey9876543210",
      }),
    });

    const res = await updateProvider(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/admin/ai/providers/[id] deletes provider and audits", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "findUnique").mockResolvedValueOnce(mockProviderConfig({ id: "p1" }));
    vi.spyOn(prisma.aiProviderConfig, "delete").mockResolvedValueOnce(mockProviderConfig({ id: "p1" }));
    vi.spyOn(prisma.auditLog, "create").mockResolvedValueOnce({} as AuditLog);

    const res = await deleteProvider(new NextRequest("http://localhost/api/admin/ai/providers/p1"), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
  });

  it("POST /api/admin/ai/providers/test tests in-flight credentials", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [{ name: "models/gemini-1.5-flash" }],
      }),
    });

    const req = new NextRequest("http://localhost/api/admin/ai/providers/test", {
      method: "POST",
      body: JSON.stringify({
        providerType: "GEMINI",
        apiKey: "AIzaSyTestKey",
        model: "gemini-1.5-flash",
      }),
    });

    const res = await testProvider(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; status: string };
    expect(data.success).toBe(true);
    expect(data.status).toBe("CONNECTED");
  });

  it("GET /api/admin/ai/health returns platform live health", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "findMany").mockResolvedValueOnce([mockProviderConfig()]);

    const res = await getAiHealth();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; defaultProvider: Record<string, unknown> };
    expect(data.status).toBe("CONNECTED");
    expect(data.defaultProvider.displayName).toBe("Google Gemini");
  });

  it("POST /api/admin/ai/providers rejects invalid custom endpoint URL with SSRF error", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.stubEnv("NODE_ENV", "production");

    const req = new NextRequest("http://localhost/api/admin/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        providerType: "OPENAI_COMPATIBLE",
        displayName: "Malicious Endpoint",
        apiKey: "key",
        baseUrl: "https://169.254.169.254/v1", // Blocked cloud metadata
      }),
    });

    const res = await createProvider(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("restricted");
  });

  it("POST /api/admin/ai/providers sanitizes isFallback to false when isDefault is true", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    let savedData: Partial<AiProviderConfig> | null = null;
    vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback) => {
      const mockTx = {
        aiProviderConfig: {
          updateMany: vi.fn(),
          create: vi.fn().mockImplementation(async (args: { data: Partial<AiProviderConfig> }) => {
            savedData = args.data;
            return mockProviderConfig({
              id: "new-p1",
              ...args.data,
            });
          }),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return callback(mockTx as any);
    });

    vi.spyOn(prisma.auditLog, "create").mockResolvedValueOnce({} as AuditLog);

    const req = new NextRequest("http://localhost/api/admin/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        providerType: "OPENAI",
        displayName: "OpenAI Mutually Exclusive Test",
        apiKey: "sk-proj-test-key-12345",
        defaultModel: "gpt-4o",
        isDefault: true,
        isFallback: true, // Conflicting flags submitted
      }),
    });

    const res = await createProvider(req);
    expect(res.status).toBe(201);
    expect(savedData).toBeDefined();
    expect(savedData!.isDefault).toBe(true);
    expect(savedData!.isFallback).toBe(false); // Must be sanitized
  });

  it("PATCH /api/admin/ai/providers/[id] sanitizes isFallback to false when isDefault is set to true", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "findUnique").mockResolvedValueOnce(
      mockProviderConfig({ id: "p1", isDefault: false, isFallback: true })
    );

    let updatedData: Partial<AiProviderConfig> | null = null;
    vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback) => {
      const mockTx = {
        aiProviderConfig: {
          updateMany: vi.fn(),
          update: vi.fn().mockImplementation(async (args: { data: Partial<AiProviderConfig> }) => {
            updatedData = args.data;
            return mockProviderConfig({
              id: "p1",
              ...args.data,
            });
          }),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return callback(mockTx as any);
    });

    vi.spyOn(prisma.auditLog, "create").mockResolvedValueOnce({} as AuditLog);

    const req = new NextRequest("http://localhost/api/admin/ai/providers/p1", {
      method: "PATCH",
      body: JSON.stringify({
        isDefault: true,
        isFallback: true, // Should be sanitized to false
      }),
    });

    const res = await updateProvider(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    expect(updatedData).toBeDefined();
    expect(updatedData!.isDefault).toBe(true);
    expect(updatedData!.isFallback).toBe(false);
  });
});
