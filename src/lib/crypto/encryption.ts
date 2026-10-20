import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const CURRENT_VERSION = "v1";

export class EncryptionConfigError extends Error {
  constructor(message = "APP_ENCRYPTION_KEY is not configured or is invalid. Set a 32-byte hex/base64 key.") {
    super(message);
    this.name = "EncryptionConfigError";
  }
}

export class DecryptionError extends Error {
  constructor(message = "Failed to decrypt secret. Data may be corrupted or key mismatch.") {
    super(message);
    this.name = "DecryptionError";
  }
}

/**
 * Returns the 32-byte encryption key from process.env.APP_ENCRYPTION_KEY.
 * Evaluated on-demand so module importing during build time does not fail.
 */
export function getEncryptionKey(): Buffer {
  let raw = process.env.APP_ENCRYPTION_KEY?.trim();

  // Strip wrapping double or single quotes if present
  if (raw) {
    raw = raw.replace(/^["']|["']$/g, "").trim();
  }

  // If missing from process.env outside of automated test runners, attempt disk discovery
  if (!raw && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    try {
      const candidates = [
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), ".env.dev"),
      ];
      for (const filePath of candidates) {
        if (fs.existsSync(/* turbopackIgnore: true */ filePath)) {
          const content = fs.readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
          const match = content.match(/^APP_ENCRYPTION_KEY\s*=\s*([^\r\n#]+)/m);
          if (match && match[1]) {
            let val = match[1].trim();
            val = val.replace(/^["']|["']$/g, "").trim();
            if (val) {
              raw = val;
              process.env.APP_ENCRYPTION_KEY = val;
              break;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // In local development, fallback to default seed key so developers are never blocked
    if (!raw && process.env.NODE_ENV !== "production") {
      raw = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.APP_ENCRYPTION_KEY = raw;
    }
  }

  if (!raw) {
    throw new EncryptionConfigError();
  }

  // 64-char hex string
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  // Base64 string of 32 bytes
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) {
      return buf;
    }
  } catch {
    // fall through
  }

  throw new EncryptionConfigError("APP_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or 44 base64 characters).");
}

/**
 * Checks if encryption is configured without throwing.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Output format: "v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>"
 */
export function encryptSecret(plaintext: string, keyBuffer?: Buffer): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Cannot encrypt empty or non-string plaintext.");
  }

  const key = keyBuffer ?? getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    CURRENT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts an AES-256-GCM payload formatted as "v1:<iv>:<authTag>:<ciphertext>".
 */
export function decryptSecret(encryptedPayload: string, keyBuffer?: Buffer): string {
  if (typeof encryptedPayload !== "string" || !encryptedPayload.includes(":")) {
    throw new DecryptionError("Malformed encrypted payload format.");
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 4) {
    throw new DecryptionError("Invalid encrypted payload segment count.");
  }

  const [version, ivB64, authTagB64, ciphertextB64] = parts;
  if (version !== CURRENT_VERSION) {
    throw new DecryptionError(`Unsupported encryption version: ${version}`);
  }

  const key = keyBuffer ?? getEncryptionKey();

  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    if (iv.length !== IV_LENGTH) {
      throw new Error("Invalid IV length.");
    }
    if (authTag.length !== 16) {
      throw new Error("Invalid auth tag length.");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    if (err instanceof DecryptionError) throw err;
    throw new DecryptionError(err instanceof Error ? err.message : "Authentication tag validation failed.");
  }
}

/**
 * Produces a safe, masked string for UI display and audit logging.
 * Preserves the provider prefix and last 4 characters, masking all intermediate characters.
 * Examples:
 *   "sk-ant-api03-abcdef1234" -> "sk-ant-••••••••1234"
 *   "AIzaSyD1234567890abcdef" -> "AIzaSy••••••••cdef"
 *   "short"                   -> "••••••••"
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return "••••••••";
  }

  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }

  let prefixLen = 4;
  if (trimmed.startsWith("sk-ant-")) prefixLen = 7;
  else if (trimmed.startsWith("sk-proj-")) prefixLen = 8;
  else if (trimmed.startsWith("sk-")) prefixLen = 3;
  else if (trimmed.startsWith("AIzaSy")) prefixLen = 6;
  else if (trimmed.startsWith("xai-")) prefixLen = 4;
  else if (trimmed.startsWith("gsk_")) prefixLen = 4;

  const suffixLen = 4;
  if (prefixLen + suffixLen >= trimmed.length) {
    return `${trimmed.slice(0, 2)}••••••••${trimmed.slice(-2)}`;
  }

  const prefix = trimmed.slice(0, prefixLen);
  const suffix = trimmed.slice(-suffixLen);
  return `${prefix}••••••••${suffix}`;
}
