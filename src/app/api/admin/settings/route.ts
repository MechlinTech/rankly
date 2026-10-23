import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { maskApiKey } from "@/lib/admin/settings-tester";
import { getIntegrationCredential, getOpenSerpCredential, saveIntegrationCredentials } from "@/lib/admin/integration-credentials";
import { prisma } from "@/lib/db";
import { DecryptionError, EncryptionConfigError } from "@/lib/crypto/encryption";
import { z } from "zod";

export interface IntegrationConfig {
  id: string;
  name: string;
  category: "Search & SEO" | "Email & Notifications" | "Artificial Intelligence" | "Payments & Billing" | "Authentication";
  description: string;
  envKey: string;
  aliasKey?: string;
  keyLabel?: string;
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

  try {
  const openSerpCredential = await getOpenSerpCredential();
  const openSerpVal = openSerpCredential.value;
  const [
    resendVal, resendFromVal, stripeVal, stripeWebhookVal, dataforseoLogin, dataforseoPass,
    googleClientId, googleSecret, msClientId, msSecret,
  ] = await Promise.all([
    getIntegrationCredential("RESEND_API_KEY"),
    getIntegrationCredential("RESEND_FROM_EMAIL").then((value) => value || getIntegrationCredential("EMAIL_FROM")),
    getIntegrationCredential("STRIPE_SECRET_KEY"),
    getIntegrationCredential("STRIPE_WEBHOOK_SECRET"),
    getIntegrationCredential("DATAFORSEO_LOGIN"),
    getIntegrationCredential("DATAFORSEO_PASSWORD"),
    getIntegrationCredential("GOOGLE_CLIENT_ID"),
    getIntegrationCredential("GOOGLE_CLIENT_SECRET"),
    getIntegrationCredential("MICROSOFT_CLIENT_ID"),
    getIntegrationCredential("MICROSOFT_CLIENT_SECRET"),
  ]);

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
    // Integration settings can still render if AI provider stats are unavailable.
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
      maskedValue: openSerpCredential.maskedValue,
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
      description: "Provides live keyword suggestions, search volume, cost-per-click, and difficulty in /keywords. Provider charges may apply.",
      envKey: "DATAFORSEO_LOGIN",
      keyLabel: "API Login (Email)",
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
      description: "Enables Microsoft 365, Azure Active Directory, and Outlook Single Sign-On. MICROSOFT_TENANT_ID defaults to common; set your tenant GUID or verified domain for single-tenant sign-in.",
      envKey: "MICROSOFT_CLIENT_ID",
      extraKey: "MICROSOFT_CLIENT_SECRET",
      extraLabel: "Client Secret",
      isConfigured: Boolean(msClientId?.trim() && msSecret?.trim()),
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
  } catch (error) {
    console.error("Failed to load admin integration settings.", error);
    const message = error instanceof EncryptionConfigError || error instanceof DecryptionError
      ? error.message
      : "Unable to load integration settings. Check the server and database configuration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  const durableUpdates = { ...updates };
  if (durableUpdates.OPENSERP_API_KEY && !durableUpdates.SERP_API_KEY) {
    durableUpdates.SERP_API_KEY = durableUpdates.OPENSERP_API_KEY;
  }
  if (durableUpdates.RESEND_FROM_EMAIL && !durableUpdates.EMAIL_FROM) {
    durableUpdates.EMAIL_FROM = durableUpdates.RESEND_FROM_EMAIL;
  }
  try {
    await saveIntegrationCredentials(durableUpdates, user.id);
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
    const errorMessage = error instanceof Error ? error.message : "Unknown persistence error";
    console.error("Failed to persist integration credentials.", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: errorCode,
      message: errorMessage,
    });

    if (error instanceof EncryptionConfigError) {
      return NextResponse.json({
        error: "Credential encryption is not configured on this app instance. Deploy with a valid APP_ENCRYPTION_KEY, then retry.",
      }, { status: 500 });
    }
    if (errorCode === "P2021" || errorCode === "P2022") {
      return NextResponse.json({
        error: "The credentials table is missing or outdated. Run the latest Prisma migration, then retry.",
      }, { status: 500 });
    }
    if (errorCode?.startsWith("P10")) {
      return NextResponse.json({
        error: "The database rejected the credential write. Check database connectivity and write permissions.",
      }, { status: 500 });
    }
    return NextResponse.json({
      error: "Could not save credentials. Check the app server logs for the persistence error and retry.",
    }, { status: 500 });
  }

  // Record audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "ADMIN_UPDATED_API_SETTINGS",
      target: "SYSTEM_ENVIRONMENT",
    metadata: { keysUpdated: Object.keys(durableUpdates) },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: "API settings securely saved and applied to the active runtime.",
  });
}
