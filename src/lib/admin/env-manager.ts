import fs from "node:fs/promises";
import path from "node:path";

/**
 * Updates or appends key-value pairs in an environment file (.env, .env.dev).
 * Preserves comments and whitespace where possible.
 */
export async function updateEnvFile(filePath: string, updates: Record<string, string>): Promise<void> {
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    content = "";
  }

  const lines = content.split(/\r?\n/);
  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (!match) return line;

    const key = match[1];
    if (key in updates) {
      updatedKeys.add(key);
      const val = updates[key];
      return `${key}="${val.replace(/"/g, '\\"')}"`;
    }
    return line;
  });

  // Append any keys that weren't already in the file
  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}="${val.replace(/"/g, '\\"')}"`);
    }
  }

  await fs.writeFile(filePath, newLines.join("\n"), "utf-8");
}

/**
 * Saves API key updates to .env, .env.dev, and memory process.env.
 */
export async function persistApiKeys(updates: Record<string, string>): Promise<void> {
  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");
  const envDevPath = path.join(rootDir, ".env.dev");

  // 1. Update runtime memory environment
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }

  // 2. Persist to disk files
  await Promise.all([updateEnvFile(envPath, updates), updateEnvFile(envDevPath, updates)]);
}
