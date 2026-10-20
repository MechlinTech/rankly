import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  maskApiKey,
  getEncryptionKey,
  isEncryptionConfigured,
  EncryptionConfigError,
  DecryptionError,
} from "./encryption";

describe("AES-256-GCM Encryption Module", () => {
  const validHexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const originalEnv = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = validHexKey;
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEnv;
  });

  it("successfully parses 64-character hex key", () => {
    const key = getEncryptionKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("successfully parses 32-byte base64 key", () => {
    const b64Key = Buffer.from(validHexKey, "hex").toString("base64");
    process.env.APP_ENCRYPTION_KEY = b64Key;
    const key = getEncryptionKey();
    expect(key.length).toBe(32);
  });

  it("throws EncryptionConfigError when key is missing or invalid", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => getEncryptionKey()).toThrow(EncryptionConfigError);

    process.env.APP_ENCRYPTION_KEY = "too-short";
    expect(() => getEncryptionKey()).toThrow(EncryptionConfigError);
  });

  it("encrypts and decrypts a secret cleanly", () => {
    const secret = "sk-ant-api03-my-super-secret-claude-key-123456789";
    const encrypted = encryptSecret(secret);

    expect(encrypted.startsWith("v1:")).toBe(true);
    const parts = encrypted.split(":");
    expect(parts.length).toBe(4);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("generates unique IVs on every encryption call (semantic security)", () => {
    const secret = "same-secret-text";
    const enc1 = encryptSecret(secret);
    const enc2 = encryptSecret(secret);

    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1)).toBe(secret);
    expect(decryptSecret(enc2)).toBe(secret);
  });

  it("rejects tampered ciphertext with DecryptionError", () => {
    const secret = "confidential-api-key";
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(":");

    // Tamper with the ciphertext segment (parts[3])
    const tamperedCipher = Buffer.from(parts[3], "base64");
    tamperedCipher[0] = tamperedCipher[0] ^ 0xff; // flip bits
    parts[3] = tamperedCipher.toString("base64");
    const tamperedPayload = parts.join(":");

    expect(() => decryptSecret(tamperedPayload)).toThrow(DecryptionError);
  });

  it("rejects tampered auth tag with DecryptionError", () => {
    const secret = "confidential-api-key";
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(":");

    // Tamper with the authTag segment (parts[2])
    const tamperedTag = Buffer.from(parts[2], "base64");
    tamperedTag[0] = tamperedTag[0] ^ 0x01;
    parts[2] = tamperedTag.toString("base64");
    const tamperedPayload = parts.join(":");

    expect(() => decryptSecret(tamperedPayload)).toThrow(DecryptionError);
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow(DecryptionError);
    expect(() => decryptSecret("v2:iv:tag:cipher")).toThrow(DecryptionError);
    expect(() => decryptSecret("v1:only:three")).toThrow(DecryptionError);
  });

  it("correctly masks different provider API keys without exposing secrets", () => {
    expect(maskApiKey("sk-ant-api03-abcdef1234567890")).toBe("sk-ant-••••••••7890");
    expect(maskApiKey("sk-proj-1234567890abcdefghij")).toBe("sk-proj-••••••••ghij");
    expect(maskApiKey("AIzaSyD1234567890abcdef")).toBe("AIzaSy••••••••cdef");
    expect(maskApiKey("xai-1234567890abcdef")).toBe("xai-••••••••cdef");
    expect(maskApiKey("gsk_1234567890abcdef")).toBe("gsk_••••••••cdef");
    expect(maskApiKey("short")).toBe("••••••••");
    expect(maskApiKey("")).toBe("••••••••");
    expect(maskApiKey(null)).toBe("••••••••");
    expect(maskApiKey(undefined)).toBe("••••••••");
  });
});
