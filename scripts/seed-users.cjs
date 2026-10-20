/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv/config");
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:root123@localhost:5432/rankly";

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log("Seeding test accounts into PostgreSQL...");

    // 1. Super Admin
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@rankly.local").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "RanklyAdmin1";
    const adminHash = await bcrypt.hash(adminPassword, 12);
    const adminId = randomUUID();

    await client.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, "emailVerified", "isSuperAdmin", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), true, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
       SET "passwordHash" = EXCLUDED."passwordHash",
           "isSuperAdmin" = true,
           name = EXCLUDED.name,
           "emailVerified" = NOW(),
           "updatedAt" = NOW()`,
      [adminId, adminEmail, adminHash, "Platform Admin"],
    );
    console.log(`✓ Super Admin ready: ${adminEmail} (password: ${adminPassword})`);

    // 2. Tenant Workspace Owner
    const ownerEmail = "owner@rankly.local";
    const ownerPassword = "RanklyOwner1";
    const ownerHash = await bcrypt.hash(ownerPassword, 12);
    const ownerId = randomUUID();

    const userRes = await client.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, "emailVerified", "isSuperAdmin", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), false, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
       SET "passwordHash" = EXCLUDED."passwordHash",
           "isSuperAdmin" = false,
           name = EXCLUDED.name,
           "emailVerified" = NOW(),
           "updatedAt" = NOW()
       RETURNING id`,
      [ownerId, ownerEmail, ownerHash, "Workspace Owner"],
    );
    const resolvedOwnerId = userRes.rows[0].id;
    console.log(`✓ Workspace Owner user ready: ${ownerEmail} (password: ${ownerPassword})`);

    // 3. Tenant
    const tenantSlug = "acme-agency";
    const tenantId = randomUUID();
    const tenantRes = await client.query(
      `INSERT INTO "Tenant" (id, slug, name, plan, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'GROWTH', 'ACTIVE', NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           plan = EXCLUDED.plan,
           status = EXCLUDED.status,
           "updatedAt" = NOW()
       RETURNING id`,
      [tenantId, tenantSlug, "Acme SEO Agency"],
    );
    const resolvedTenantId = tenantRes.rows[0].id;
    console.log(`✓ Tenant ready: Acme SEO Agency (${tenantSlug})`);

    // 4. Membership (Role = OWNER)
    const membershipId = randomUUID();
    await client.query(
      `INSERT INTO "Membership" (id, "tenantId", "userId", role, "isActive", "createdAt")
       VALUES ($1, $2, $3, 'OWNER', true, NOW())
       ON CONFLICT ("tenantId", "userId") DO UPDATE
       SET role = 'OWNER',
           "isActive" = true`,
      [membershipId, resolvedTenantId, resolvedOwnerId],
    );
    console.log(`✓ Membership ready: ${ownerEmail} is OWNER of Acme SEO Agency`);

    // 5. Sample Project
    const projectId = randomUUID();
    const existingProject = await client.query(
      `SELECT id FROM "Project" WHERE "tenantId" = $1 LIMIT 1`,
      [resolvedTenantId],
    );

    let resolvedProjectId;
    if (existingProject.rows.length > 0) {
      resolvedProjectId = existingProject.rows[0].id;
    } else {
      const projRes = await client.query(
        `INSERT INTO "Project" (id, "tenantId", name, domain, "createdAt", "updatedAt")
         VALUES ($1, $2, 'Acme Global Portal', 'acme.example.com', NOW(), NOW())
         RETURNING id`,
        [projectId, resolvedTenantId],
      );
      resolvedProjectId = projRes.rows[0].id;
      console.log(`✓ Project ready: Acme Global Portal (acme.example.com)`);

      // 6. Sample Keywords
      const keywords = [
        { term: "ai search optimization", volume: 14800, diff: 42, pos: 3 },
        { term: "multi provider ai gateway", volume: 5400, diff: 31, pos: 1 },
        { term: "seo rank tracker", volume: 22000, diff: 68, pos: 7 },
      ];

      for (const kw of keywords) {
        const kwId = randomUUID();
        await client.query(
          `INSERT INTO "Keyword" (id, "projectId", term, locale, "searchVolume", difficulty, tags, "createdAt")
           VALUES ($1, $2, $3, 'en-US', $4, $5, ARRAY['seo', 'ai'], NOW())
           ON CONFLICT ("projectId", term, locale) DO NOTHING`,
          [kwId, resolvedProjectId, kw.term, kw.volume, kw.diff],
        );

        const snapId = randomUUID();
        await client.query(
          `INSERT INTO "RankSnapshot" (id, "projectId", "keywordId", position, url, "searchEngine", device, "capturedAt")
           VALUES ($1, $2, $3, $4, 'https://acme.example.com/blog', 'google', 'desktop', NOW())`,
          [snapId, resolvedProjectId, kwId, kw.pos],
        );
      }
      console.log(`✓ Seeded ${keywords.length} sample keywords & rank snapshots`);
    }

    console.log("\n=======================================================");
    console.log("  SEED COMPLETED SUCCESSFULLY");
    console.log("=======================================================");
    console.log("1. Super Admin Account (AI Configuration & Admin Panel):");
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log("   URL:      http://localhost:3000/admin/settings (or /admin)");
    console.log("");
    console.log("2. Workspace Owner Account (SEO & Workspace Dashboard):");
    console.log(`   Email:    ${ownerEmail}`);
    console.log(`   Password: ${ownerPassword}`);
    console.log("   URL:      http://localhost:3000/keywords (or /login)");
    console.log("=======================================================\n");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
