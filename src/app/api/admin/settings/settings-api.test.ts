import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { GET } from "./route";
import * as authSuperAdmin from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/crypto/encryption";

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

describe("GET /api/admin/settings", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.spyOn(prisma.integrationCredential, "findUnique").mockResolvedValue(null);
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
    vi.restoreAllMocks();
  });

  it("returns all integration cards for Search, Email, Billing, and Auth while excluding the legacy Anthropic card", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "count")
      .mockResolvedValueOnce(2) // total
      .mockResolvedValueOnce(1); // active

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.integrations).toBeDefined();
    expect(Array.isArray(data.integrations)).toBe(true);

    const ids = data.integrations.map((i: { id: string }) => i.id);
    expect(ids).toContain("openserp");
    expect(ids).toContain("resend");
    expect(ids).toContain("stripe");
    expect(ids).toContain("dataforseo");
    expect(ids).toContain("google_oauth");
    expect(ids).toContain("microsoft_oauth");

    // Legacy Anthropic card must NOT be present
    expect(ids).not.toContain("anthropic");

    expect(data.aiStats).toEqual({ total: 2, active: 1 });
  });

  it("handles database errors gracefully without crashing the settings response", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });

    vi.spyOn(prisma.aiProviderConfig, "count").mockRejectedValue(new Error("DB offline"));

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.integrations.length).toBe(6);
    expect(data.aiStats).toEqual({ total: 0, active: 0 });
  });

  it("shows database-saved credentials as configured after a fresh settings read", async () => {
    vi.spyOn(authSuperAdmin, "requireSuperAdmin").mockResolvedValueOnce({
      user: mockAdminUser(),
      response: null,
    });
    vi.spyOn(prisma.aiProviderConfig, "count").mockResolvedValue(0);
    const credentials = new Map([
      ["OPENSERP_API_KEY", "osk_live_saved-key-4321"],
      ["SERP_API_KEY", "osk_live_saved-key-4321"],
      ["RESEND_API_KEY", "re_saved-key-9876"],
    ]);
    vi.spyOn(prisma.integrationCredential, "findUnique").mockImplementation((args) => {
      const name = args.where.name;
      const value = name ? credentials.get(name) : undefined;
      return Promise.resolve(value && name ? {
        name,
        encryptedValue: encryptSecret(value),
        maskedValue: "••••••••",
        updatedAt: new Date(),
        updatedById: "admin-1",
      } : null) as never;
    });

    const res = await GET();
    const data = await res.json();
    const openserp = data.integrations.find((item: { id: string }) => item.id === "openserp");
    const resend = data.integrations.find((item: { id: string }) => item.id === "resend");
    expect(openserp.isConfigured).toBe(true);
    expect(resend.isConfigured).toBe(true);
  });
});
