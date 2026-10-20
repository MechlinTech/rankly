import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";
import * as authSuperAdmin from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

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
  afterEach(() => {
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
});
