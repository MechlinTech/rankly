// Creates or updates the platform super-admin from ADMIN_EMAIL / ADMIN_PASSWORD.
// Uses `pg` directly so the migrate image does not need the generated Prisma client
// (Prisma 7 emits TypeScript under src/generated, which Node cannot require).
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const name = process.env.ADMIN_NAME || "Platform Admin";

async function main() {
  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin seed.");
    return;
  }
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, "emailVerified", "isSuperAdmin", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), true, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
       SET "passwordHash" = EXCLUDED."passwordHash",
           "isSuperAdmin" = true,
           name = EXCLUDED.name,
           "emailVerified" = NOW(),
           "updatedAt" = NOW()`,
      [randomUUID(), email, passwordHash, name],
    );
    console.log(`Super admin ready: ${email}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
