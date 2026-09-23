import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tokens = await prisma.passwordResetToken.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log("Reset tokens:", JSON.stringify(tokens, null, 2));
  await prisma.$disconnect();
}

main();
