import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { maskApiKey } from "@/lib/admin/settings-tester";
import { persistApiKeys } from "@/lib/admin/env-manager";
import { prisma } from "@/lib/db";
import { z } from "zod";

export interface IntegrationConfig {
  id: string;
  name: string;
  category: "Search & SEO" | "Email & Notifications" | "Artificial Intelligence" | "Payments & Billing" | "Authentication";
  description: string;
  envKey: string;
  aliasKey?: string;
  extraKey?: string;
  extraLabel?: string;
  isConfigured: boolean;
  maskedValue: string | null;
  maskedExtraValue?: string | null;
  placeholder: string;
}

export async function GET() {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const openSerpVal = process.env.OPENSERP_API_KEY || process.env.SERP_API_KEY;
  const resendVal = process.env.RESEND_API_KEY;
  const resendFromVal = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  const stripeVal = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookVal = process.env.STRIPE_WEBHOOK_SECRET;
  const dataforseoLogin = process.env.DATAFORSEO_LOGIN;
  const dataforseoPass = process.env.DATAFORSEO_PASSWORD;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const msClientId = process.env.MICROSOFT_CLIENT_ID;
  const msSecret = process.env.MICROSOFT_CLIENT_SECRET;

  let aiTotal = 0;
  let aiActive = 0;
  try {
    const [t, a] = await Promise.all([
      prisma.aiProviderConfig.count(),
      prisma.aiProviderConfig.count({ where: { isActive: true } }),
    ]);
    aiTotal = t;
    aiActive = a;
  } catch {
    // If DB is offline or mock, do not crash settings page
  }

  const integrations: IntegrationConfig[] = [
    {
      id: "openserp",
      name: "OpenSERP / Google SERP API",
      category: "Search & SEO",
      description: "Powers live Google rank checks in /rankings and related-search / People Also Ask ideas in /keywords.",
      envKey: "OPENSERP_API_KEY",
      aliasKey: "SERP_API_KEY",
      isConfigured: Boolean(openSerpVal?.trim()),
      maskedValue: maskApiKey(openSerpVal),
      placeholder: "osk_live_...",
    },
    {
      id: "resend",
      name: "Resend Email Service",
      category: "Email & Notifications",
      description: "Handles outbound transactional emails, verification links, password resets, and team invites.",
      envKey: "RESEND_API_KEY",
      extraKey: "RESEND_FROM_EMAIL",
      extraLabel: "Sender Email (From)",
      isConfigured: Boolean(resendVal?.trim()),
      maskedValue: maskApiKey(resendVal),
      maskedExtraValue: resendFromVal ?? null,
      placeholder: "re_...",
    },
    {
      id: "stripe",
      name: "Stripe Billing & Subscriptions",
      category: "Payments & Billing",
      description: "Manages SaaS subscription plans, customer portal sessions, and payment webhooks.",
      envKey: "STRIPE_SECRET_KEY",
      extraKey: "STRIPE_WEBHOOK_SECRET",
      extraLabel: "Webhook Secret",
      isConfigured: Boolean(stripeVal?.trim()),
      maskedValue: maskApiKey(stripeVal),
      maskedExtraValue: maskApiKey(stripeWebhookVal),
      placeholder: "sk_live_... or sk_test_...",
    },
    {
      id: "dataforseo",
      name: "DataForSEO API",
      category: "Search & SEO",
      description: "Provides global keyword metrics, search volume, cost-per-click, and difficulty in /keywords.",
      envKey: "DATAFORSEO_LOGIN",
      extraKey: "DATAFORSEO_PASSWORD",
      extraLabel: "API Password",
      isConfigured: Boolean(dataforseoLogin?.trim() && dataforseoPass?.trim()),
      maskedValue: dataforseoLogin ?? null,
      maskedExtraValue: maskApiKey(dataforseoPass),
      placeholder: "login@example.com",
    },
    {
      id: "google_oauth",
      name: "Google OAuth (SSO)",
      category: "Authentication",
      description: "Enables Google One-Click Social Login & Single Sign-On across all tenant workspaces.",
      envKey: "GOOGLE_CLIENT_ID",
      extraKey: "GOOGLE_CLIENT_SECRET",
      extraLabel: "Client Secret",
      isConfigured: Boolean(googleClientId?.trim()),
      maskedValue: googleClientId ?? null,
      maskedExtraValue: maskApiKey(googleSecret),
      placeholder: "your-app-id.apps.googleusercontent.com",
    },
    {
      id: "microsoft_oauth",
      name: "Microsoft 365 / Entra ID (SSO)",
      category: "Authentication",
      description: "Enables Microsoft 365, Azure Active Directory, and Outlook Single Sign-On.",
      envKey: "MICROSOFT_CLIENT_ID",
      extraKey: "MICROSOFT_CLIENT_SECRET",
      extraLabel: "Client Secret",
      isConfigured: Boolean(msClientId?.trim()),
      maskedValue: msClientId ?? null,
      maskedExtraValue: maskApiKey(msSecret),
      placeholder: "00000000-0000-0000-0000-000000000000",
    },
  ];

  return NextResponse.json({
    integrations,
    aiStats: {
      total: aiTotal,
      active: aiActive,
    },
  });
}

const updateSchema = z.object({
  updates: z.record(z.string().min(1), z.string()),
});

export async function POST(req: NextRequest) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid updates payload." }, { status: 400 });
  }

  const { updates } = parsed.data;

  // If OPENSERP_API_KEY is updated, also update SERP_API_KEY for backward compatibility
  if (updates.OPENSERP_API_KEY && !updates.SERP_API_KEY) {
    updates.SERP_API_KEY = updates.OPENSERP_API_KEY;
  }

  await persistApiKeys(updates);

  // Record audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "ADMIN_UPDATED_API_SETTINGS",
      target: "SYSTEM_ENVIRONMENT",
      metadata: { keysUpdated: Object.keys(updates) },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: "API settings updated and applied to system runtime successfully.",
  });
}
