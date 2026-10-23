import { createHash, randomBytes } from "node:crypto";

/** RFC 7636 S256 code verifier (43 URL-safe characters). */
export function createCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** RFC 7636 S256 code challenge. */
export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}
