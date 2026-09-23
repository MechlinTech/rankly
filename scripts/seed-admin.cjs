// Creates or updates the platform super-admin from ADMIN_EMAIL / ADMIN_PASSWORD.
// Used by the migrate container after `prisma migrate deploy`.
const bcrypt = require("bcryptjs");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../src/generated/prisma/client");

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

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isSuperAdmin: true,
      name,
      emailVerified: new Date(),
    },
    create: {
      email,
      passwordHash,
      isSuperAdmin: true,
      name,
      emailVerified: new Date(),
    },
  });

  console.log(`Super admin ready: ${user.email}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
