import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskApiKey } from "@/lib/crypto/encryption";

const CREDENTIAL_NAME = "OPENSERP_API_KEY";

export async function getIntegrationCredential(name: string): Promise<string | null> {
  let stored;
  try {
    stored = await prisma.integrationCredential.findUnique({ where: { name } });
  } catch {
    // Retain environment-based deployments when the database cannot be read.
    return process.env[name]?.trim() || null;
  }
  // Surface a key mismatch/corrupt ciphertext instead of silently hiding it.
  if (stored) return decryptSecret(stored.encryptedValue);
  return process.env[name]?.trim() || null;
}

export async function saveIntegrationCredentials(updates: Record<string, string>, updatedById: string): Promise<void> {
  const entries = Object.entries(updates).map(([name, rawValue]) => {
    const value = rawValue.trim();
    return prisma.integrationCredential.upsert({
      where: { name },
      create: {
        name,
        encryptedValue: encryptSecret(value),
        maskedValue: maskApiKey(value) ?? "••••••••",
        updatedById,
      },
      update: {
        encryptedValue: encryptSecret(value),
        maskedValue: maskApiKey(value) ?? "••••••••",
        updatedById,
      },
    });
  });
  if (entries.length === 0) return;
  await prisma.$transaction(entries);

  for (const [name, value] of Object.entries(updates)) {
    process.env[name] = value.trim();
  }
}

export async function getOpenSerpCredential(): Promise<{ value: string | null; maskedValue: string | null }> {
  const stored = await prisma.integrationCredential.findUnique({ where: { name: CREDENTIAL_NAME } }).catch(() => null);
  const value = stored ? decryptSecret(stored.encryptedValue) : await getIntegrationCredential("SERP_API_KEY");
  const fallback = value || process.env.OPENSERP_API_KEY || process.env.SERP_API_KEY || null;
  return { value: fallback, maskedValue: stored?.maskedValue ?? maskApiKey(fallback) };
}

export async function saveOpenSerpCredential(value: string, updatedById: string): Promise<void> {
  const trimmed = value.trim();
  await saveIntegrationCredentials({ [CREDENTIAL_NAME]: trimmed, SERP_API_KEY: trimmed }, updatedById);
}
