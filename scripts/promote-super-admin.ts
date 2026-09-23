// Promotes an existing user to platform super admin. There is deliberately no
// self-service way to become a super admin from the app itself (least privilege) -
// an operator runs this manually with direct database access.
//
// Usage: npx tsx scripts/promote-super-admin.ts someone@example.com
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/promote-super-admin.ts <email>");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.update({
    where: { email },
    data: { isSuperAdmin: true },
  });
  console.log(`${user.email} is now a super admin.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
