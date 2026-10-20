import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getIntegrationCredential, getOpenSerpCredential, saveIntegrationCredentials, saveOpenSerpCredential } from "./integration-credentials";

describe("OpenSERP credential persistence", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  const originalOpenSerpKey = process.env.OPENSERP_API_KEY;
  const originalSerpKey = process.env.SERP_API_KEY;

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
    if (originalOpenSerpKey === undefined) delete process.env.OPENSERP_API_KEY;
    else process.env.OPENSERP_API_KEY = originalOpenSerpKey;
    if (originalSerpKey === undefined) delete process.env.SERP_API_KEY;
    else process.env.SERP_API_KEY = originalSerpKey;
    vi.restoreAllMocks();
  });

  it("stores the key encrypted and reloads it from the database", async () => {
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const upsert = vi.spyOn(prisma.integrationCredential, "upsert").mockResolvedValue({
      name: "OPENSERP_API_KEY",
      encryptedValue: "",
      maskedValue: "",
      updatedAt: new Date(),
      updatedById: "admin-1",
    });
    vi.spyOn(prisma, "$transaction").mockResolvedValue([] as never);

    await saveOpenSerpCredential("  osk_live_super-secret-4321  ", "admin-1");

    const saved = upsert.mock.calls[0][0].create;
    expect(saved.encryptedValue).not.toContain("super-secret");
    expect(saved.maskedValue).toContain("4321");

    vi.spyOn(prisma.integrationCredential, "findUnique").mockResolvedValue({
      name: "OPENSERP_API_KEY",
      encryptedValue: saved.encryptedValue,
      maskedValue: saved.maskedValue,
      updatedAt: new Date(),
      updatedById: "admin-1",
    });
    await expect(getOpenSerpCredential()).resolves.toEqual({
      value: "osk_live_super-secret-4321",
      maskedValue: saved.maskedValue,
    });
  });

  it("saves other Admin Settings credentials in the same encrypted store", async () => {
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const upsert = vi.spyOn(prisma.integrationCredential, "upsert").mockResolvedValue({
      name: "",
      encryptedValue: "",
      maskedValue: "",
      updatedAt: new Date(),
      updatedById: "admin-1",
    });
    vi.spyOn(prisma, "$transaction").mockResolvedValue([] as never);

    await saveIntegrationCredentials({
      RESEND_API_KEY: "re_secret",
      STRIPE_SECRET_KEY: "sk_test_secret",
      GOOGLE_CLIENT_SECRET: "google_secret",
    }, "admin-1");

    expect(upsert).toHaveBeenCalledTimes(3);
    for (const [args] of upsert.mock.calls) {
      expect(args.create.encryptedValue).not.toContain("secret");
    }
  });

  it("reads a saved provider key in preference to a stale environment key", async () => {
    process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.STRIPE_SECRET_KEY = "sk_test_old";
    const encryptedValue = (await import("@/lib/crypto/encryption")).encryptSecret("sk_test_saved");
    vi.spyOn(prisma.integrationCredential, "findUnique").mockResolvedValue({
      name: "STRIPE_SECRET_KEY",
      encryptedValue,
      maskedValue: "sk_••••••••aved",
      updatedAt: new Date(),
      updatedById: "admin-1",
    });

    await expect(getIntegrationCredential("STRIPE_SECRET_KEY")).resolves.toBe("sk_test_saved");
  });
});
